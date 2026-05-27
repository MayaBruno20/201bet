'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

type FinishedDuel = {
  id: string;
  startsAt: string;
  status: string;
  left: { driverName: string; carName: string };
  right: { driverName: string; carName: string };
  winnerSide: 'LEFT' | 'RIGHT' | null;
  leftPool: number;
  rightPool: number;
  totalPool: number;
  leftPercent: number;
  rightPercent: number;
};

type FinishedEvent = {
  id: string;
  sport: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  startAt: string;
  status: string;
  totalPool: number;
  duelsCount: number;
  settledDuels: number;
  duels: FinishedDuel[];
};

export default function EventosFinalizadosPage() {
  const [events, setEvents] = useState<FinishedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`${apiUrl}/events/finished`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Falha ao carregar eventos finalizados (${r.status})`);
        return (await r.json()) as FinishedEvent[];
      })
      .then(setEvents)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
        <MainNav />

        <Link
          href='/eventos'
          className='mt-2 inline-flex items-center gap-2 text-xs text-white/40 transition hover:text-white'
        >
          <svg className='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
            <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
          </svg>
          Voltar para Eventos
        </Link>

        {/* Hero */}
        <section className='mt-4 rounded-2xl border border-white/10 bg-[#101525] p-5 sm:p-6'>
          <p className='text-[10px] font-bold uppercase tracking-[0.3em] text-white/30'>Histórico</p>
          <h1 className='mt-2 text-2xl font-semibold sm:text-3xl'>Eventos Finalizados</h1>
          <p className='mt-2 text-sm text-white/50'>
            Resumo das passadas, ganhadores e distribuição do pot dos eventos encerrados.
          </p>
          <div className='mt-4 flex items-center gap-3 flex-wrap'>
            <span className='inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-medium text-white/60'>
              {events.length} evento{events.length !== 1 ? 's' : ''} encerrado{events.length !== 1 ? 's' : ''}
            </span>
          </div>
        </section>

        {loading && (
          <div className='mt-8 flex flex-col items-center justify-center py-16'>
            <div className='h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60' />
            <p className='mt-4 text-sm text-white/40'>Carregando histórico...</p>
          </div>
        )}

        {error && (
          <div className='mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4'>
            <p className='text-sm text-red-200'>{error}</p>
          </div>
        )}

        <div className='mt-6 space-y-6'>
          {events.map((event) => {
            const isOpen = !!expanded[event.id];
            const pct = event.duelsCount > 0 ? Math.round((event.settledDuels / event.duelsCount) * 100) : 0;
            return (
              <article
                key={event.id}
                className='group rounded-3xl border border-white/10 bg-[#101525] overflow-hidden transition-colors hover:border-white/15'
              >
                {/* Header */}
                <div className='relative p-3 sm:p-6'>
                  <div className='flex flex-wrap items-start justify-between gap-4'>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-2 sm:gap-3 mb-2 flex-wrap'>
                        <span className='inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold tracking-wider text-white/60'>
                          ENCERRADO
                        </span>
                        <span className='text-[11px] text-white/40 tabular-nums'>
                          {new Date(event.startAt).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      <h2 className='text-lg sm:text-2xl font-semibold tracking-tight break-words'>{event.name}</h2>
                      {event.description && (
                        <p className='mt-1 text-xs sm:text-sm text-white/60 line-clamp-2'>{event.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Stats — agora 2 colunas (Pot total foi removido por solicitação do usuário) */}
                  <div className='mt-4 grid grid-cols-2 gap-2 sm:gap-3'>
                    <div className='rounded-xl border border-white/10 bg-white/[0.03] p-2.5 sm:p-3 min-w-0'>
                      <p className='text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-white/40'>Passadas</p>
                      <p className='mt-1 text-sm sm:text-lg font-bold tabular-nums'>
                        {event.settledDuels}<span className='text-white/30'>/{event.duelsCount}</span>
                      </p>
                    </div>
                    <div className='rounded-xl border border-white/10 bg-white/[0.03] p-2.5 sm:p-3 min-w-0'>
                      <p className='text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-white/40'>Auditadas</p>
                      <p className='mt-1 text-sm sm:text-lg font-bold tabular-nums text-emerald-400'>{pct}%</p>
                    </div>
                  </div>

                  <button
                    type='button'
                    onClick={() => toggle(event.id)}
                    className='mt-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium text-white/80 transition-colors hover:border-white/20 hover:bg-white/10 w-full sm:w-auto justify-center'
                  >
                    {isOpen ? 'Esconder passadas' : 'Ver passadas e ganhadores'}
                    <svg
                      className={`h-4 w-4 text-white/50 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      fill='none'
                      viewBox='0 0 24 24'
                      stroke='currentColor'
                      strokeWidth={2}
                    >
                      <path strokeLinecap='round' strokeLinejoin='round' d='M19 9l-7 7-7-7' />
                    </svg>
                  </button>
                </div>

                {/* Passadas */}
                {isOpen && (
                  <div className='border-t border-white/5 p-3 sm:p-6 space-y-2.5 sm:space-y-3'>
                    {event.duels.length === 0 ? (
                      <p className='text-sm text-white/40 text-center py-6'>Nenhuma passada registrada.</p>
                    ) : (
                      event.duels.map((d, idx) => <PassadaCard key={d.id} d={d} index={idx + 1} />)
                    )}
                  </div>
                )}
              </article>
            );
          })}

          {!loading && events.length === 0 && !error && (
            <div className='rounded-2xl border border-dashed border-white/10 p-12 text-center'>
              <svg className='mx-auto h-10 w-10 text-white/15' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1} d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' />
              </svg>
              <p className='mt-3 text-sm text-white/40'>Nenhum evento finalizado ainda</p>
              <p className='mt-1 text-xs text-white/25'>
                Eventos encerrados aparecem aqui com o resumo das passadas e o pot total.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function PassadaCard({ d, index }: { d: FinishedDuel; index: number }) {
  const leftWon = d.winnerSide === 'LEFT';
  const rightWon = d.winnerSide === 'RIGHT';
  const noBets = d.totalPool === 0;
  const leftPct = Math.round(d.leftPercent);
  const rightPct = Math.round(d.rightPercent);

  return (
    <div className='rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4'>
      <div className='flex items-start gap-2 sm:gap-3 mb-3'>
        <span className='inline-flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-[10px] sm:text-[11px] font-bold text-white/70 tabular-nums'>
          #{index}
        </span>

        {/* Mobile: empilhado vertical. sm+: grid horizontal com VS no meio. */}
        <div className='flex-1 min-w-0'>
          {/* Mobile layout */}
          <div className='sm:hidden space-y-1.5'>
            <DriverRowMobile driver={d.left} won={leftWon} lost={rightWon} />
            <div className='flex items-center gap-2'>
              <div className='flex-1 h-px bg-white/10' />
              <span className='text-[9px] font-bold tracking-widest text-white/30 shrink-0'>VS</span>
              <div className='flex-1 h-px bg-white/10' />
            </div>
            <DriverRowMobile driver={d.right} won={rightWon} lost={leftWon} />
          </div>

          {/* Desktop layout */}
          <div className='hidden sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center gap-3'>
            <DriverRowDesktop driver={d.left} won={leftWon} lost={rightWon} align='left' />
            <span className='text-[10px] font-bold tracking-widest text-white/30 px-2 shrink-0'>VS</span>
            <DriverRowDesktop driver={d.right} won={rightWon} lost={leftWon} align='right' />
          </div>
        </div>
      </div>

      {/* Distribuição do pool — sem mostrar valores absolutos (R$). Pot total foi
          removido por solicitação do usuário, então mantemos só a proporção
          relativa entre os lados. */}
      {!noBets ? (
        <div className='space-y-1.5'>
          <div className='flex items-center justify-between text-[10px] sm:text-[11px] tabular-nums'>
            <span className={leftWon ? 'text-emerald-400 font-semibold' : 'text-white/60'}>
              {leftPct}%
            </span>
            <span className='text-[9px] font-bold uppercase tracking-[0.12em] text-white/30'>
              Distribuição
            </span>
            <span className={rightWon ? 'text-emerald-400 font-semibold' : 'text-white/60'}>
              {rightPct}%
            </span>
          </div>

          <div className='relative h-2 rounded-full overflow-hidden bg-white/[0.04]'>
            <div
              className='absolute inset-y-0 left-0 transition-all'
              style={{
                width: `${leftPct}%`,
                background: leftWon ? 'rgba(16, 185, 129, 0.9)' : 'rgba(59, 130, 246, 0.55)',
              }}
            />
            <div
              className='absolute inset-y-0 right-0 transition-all'
              style={{
                width: `${rightPct}%`,
                background: rightWon ? 'rgba(16, 185, 129, 0.9)' : 'rgba(244, 63, 94, 0.55)',
              }}
            />
          </div>
        </div>
      ) : (
        <p className='text-[10px] text-white/30 italic text-center py-1'>Nenhuma aposta registrada nesta passada.</p>
      )}
    </div>
  );
}

type DriverInfo = { driverName: string; carName: string };

function DriverRowMobile({ driver, won, lost }: { driver: DriverInfo; won: boolean; lost: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 ${lost ? 'opacity-40' : ''}`}>
      <div className='min-w-0 flex-1'>
        <p className={`text-sm font-semibold truncate ${won ? 'text-emerald-300' : 'text-white/80'}`}>
          {driver.driverName}
        </p>
        {driver.carName?.trim() && (
          <p className='text-[10px] text-white/40 truncate'>{driver.carName}</p>
        )}
      </div>
      {won && (
        <span className='inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold tracking-wider text-emerald-300 shrink-0'>
          🏆 VENCEU
        </span>
      )}
    </div>
  );
}

function DriverRowDesktop({
  driver,
  won,
  lost,
  align,
}: {
  driver: DriverInfo;
  won: boolean;
  lost: boolean;
  align: 'left' | 'right';
}) {
  const chip = won && (
    <span className='inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold tracking-wider text-emerald-300 shrink-0'>
      🏆 VENCEU
    </span>
  );
  const name = (
    <div className='min-w-0'>
      <p className={`text-sm font-semibold truncate ${won ? 'text-emerald-300' : 'text-white/80'}`}>
        {driver.driverName}
      </p>
      {driver.carName?.trim() && (
        <p className='text-[10px] text-white/40 truncate'>{driver.carName}</p>
      )}
    </div>
  );

  return (
    <div
      className={`flex items-center gap-2 min-w-0 ${lost ? 'opacity-40' : ''} ${
        align === 'left' ? 'justify-end text-right' : 'justify-start text-left'
      }`}
    >
      {align === 'left' ? (
        <>
          {chip}
          {name}
        </>
      ) : (
        <>
          {name}
          {chip}
        </>
      )}
    </div>
  );
}
