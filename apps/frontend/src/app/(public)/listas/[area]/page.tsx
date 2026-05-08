'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { ListLogo } from '@/components/list-logo';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

type RosterEntry = {
  id: string;
  position: number;
  isKing: boolean;
  driverId: string;
  driverName: string | null;
  driverNickname: string | null;
  driverCarNumber: string | null;
  driverTeam: string | null;
  driverHometown: string | null;
  driverAvatarUrl: string | null;
};

type EventMatchup = {
  id: string;
  roundNumber: number;
  roundType: 'ODD' | 'EVEN' | 'SHARK_TANK';
  order: number;
  leftPosition: number | null;
  rightPosition: number | null;
  leftDriverName: string | null;
  rightDriverName: string | null;
  winnerSide: 'LEFT' | 'RIGHT' | null;
  isManualOverride: boolean;
};

type ListEvent = {
  id: string;
  name: string;
  scheduledAt: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELED';
  notes: string | null;
  matchups: EventMatchup[];
};

type ListDetail = {
  id: string;
  areaCode: number;
  name: string;
  format: 'TOP_10' | 'TOP_20';
  administratorName: string | null;
  hometown: string | null;
  roster: RosterEntry[];
  events: ListEvent[];
  kingName: string | null;
  rosterCount: number;
};

export default function ListaAreaPage() {
  const params = useParams<{ area: string }>();
  const area = params?.area;
  const [list, setList] = useState<ListDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!area) return;
    setLoading(true);
    fetch(`${apiUrl}/brazil-lists/${area}`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error('Lista não encontrada');
          throw new Error(`Falha ao carregar lista (${res.status})`);
        }
        return (await res.json()) as ListDetail;
      })
      .then(setList)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [area]);

  const maxSlots = list?.format === 'TOP_20' ? 20 : 10;
  const paddedRoster = useMemo(() => {
    if (!list) return [];
    const byPos = new Map<number, RosterEntry>();
    for (const entry of list.roster) byPos.set(entry.position, entry);
    return Array.from({ length: maxSlots }, (_, idx) => {
      const pos = idx + 1;
      return byPos.get(pos) ?? { position: pos, vacant: true as const };
    });
  }, [list, maxSlots]);

  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
        <MainNav />

        <Link href='/listas' className='mt-2 inline-flex items-center gap-2 text-xs text-white/40 transition hover:text-white'>
          <svg className='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
            <path strokeLinecap='round' strokeLinejoin='round' d='M15 19l-7-7 7-7' />
          </svg>
          Voltar para as Listas
        </Link>

        {loading && (
          <div className='mt-8 flex flex-col items-center justify-center py-16'>
            <div className='h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60' />
          </div>
        )}

        {error && (
          <div className='mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4'>
            <p className='text-sm text-red-200'>{error}</p>
          </div>
        )}

        {list && (
          <>
            <section className='mt-4 rounded-2xl border border-white/10 bg-[#101525] p-6 sm:p-8'>
              <div className='flex flex-wrap items-start gap-4'>
                <ListLogo areaCode={list.areaCode} className='h-16 w-16' fallbackTextClassName='text-lg' />
                <div className='flex-1 min-w-0'>
                  <div className='flex items-center gap-2'>
                    <h1 className='text-2xl font-bold tracking-tight sm:text-3xl truncate'>{list.name}</h1>
                    <span className='rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white/60'>
                      {list.format === 'TOP_20' ? 'TOP 20' : 'TOP 10'}
                    </span>
                  </div>
                  <div className='mt-2 flex flex-wrap items-center gap-2 text-xs text-white/50'>
                    {list.administratorName && <span>Administração: {list.administratorName}</span>}
                    {list.hometown && (
                      <>
                        <span className='h-1 w-1 rounded-full bg-white/20' />
                        <span>{list.hometown}</span>
                      </>
                    )}
                    <span className='h-1 w-1 rounded-full bg-white/20' />
                    <span>
                      {list.rosterCount} / {maxSlots} titulares
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className='mt-6 rounded-2xl border border-white/10 bg-[#101525] p-5 sm:p-6'>
              <div className='flex items-center justify-between gap-3 mb-4'>
                <h2 className='text-base font-semibold tracking-tight sm:text-lg'>Grade de titulares</h2>
                <span className='rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/60'>
                  {list.rosterCount} / {maxSlots}
                </span>
              </div>
              <ol className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-2'>
                {paddedRoster.map((entry) => (
                  <RosterRow key={entry.position} entry={entry} />
                ))}
              </ol>
            </section>

            <section className='mt-6 rounded-2xl border border-white/10 bg-[#101525] p-5 sm:p-6'>
              <h2 className='text-base font-semibold tracking-tight sm:text-lg'>Próximos eventos</h2>
              {list.events.length === 0 ? (
                <p className='mt-2 text-sm text-white/40'>Nenhum evento agendado. Consulte a administração.</p>
              ) : (
                <div className='mt-4 space-y-4'>
                  {list.events.map((ev) => (
                    <EventBlock key={ev.id} event={ev} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

type RosterRowProps = {
  entry: RosterEntry | { position: number; vacant: true };
};

function RosterRow({ entry }: RosterRowProps) {
  const vacant = 'vacant' in entry && entry.vacant === true;
  if (vacant) {
    return (
      <li className='flex items-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3'>
        <span className='inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-xs font-bold text-white/40'>
          {entry.position}
        </span>
        <span className='text-sm text-white/30 italic'>Vaga em aberto</span>
      </li>
    );
  }
  const e = entry as RosterEntry;
  return (
    <li className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${e.isKing ? 'border-[#d4a843]/50 bg-[#d4a843]/10' : 'border-white/10 bg-white/[0.03]'}`}>
      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${e.isKing ? 'bg-[#d4a843]/30 text-[#d4a843]' : 'bg-white/10 text-white/70'}`}>
        {e.position}
      </span>
      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-2'>
          <p className='text-sm font-semibold truncate'>{e.driverName ?? '—'}</p>
          {e.isKing && (
            <span className='rounded-full border border-[#d4a843]/50 bg-[#d4a843]/20 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-[#d4a843]'>
              REI
            </span>
          )}
          {e.driverCarNumber && (
            <span className='rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-white/60'>#{e.driverCarNumber}</span>
          )}
        </div>
        {e.driverTeam && <p className='mt-0.5 text-xs text-white/40 truncate'>{e.driverTeam}</p>}
      </div>
    </li>
  );
}

function EventBlock({ event }: { event: ListEvent }) {
  const statusLabel: Record<string, string> = {
    DRAFT: 'Rascunho',
    IN_PROGRESS: 'Em andamento',
    FINISHED: 'Encerrado',
    CANCELED: 'Cancelado',
  };
  const statusColor: Record<string, string> = {
    DRAFT: 'bg-white/10 text-white/60 border-white/10',
    IN_PROGRESS: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    FINISHED: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    CANCELED: 'bg-red-500/15 text-red-400 border-red-500/20',
  };

  const grouped = new Map<string, EventMatchup[]>();
  for (const m of event.matchups) {
    const key = `${m.roundNumber}-${m.roundType}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  return (
    <article className='rounded-xl border border-white/10 bg-white/[0.03] p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <p className='text-sm font-semibold'>{event.name}</p>
          <p className='text-xs text-white/40'>
            {new Date(event.scheduledAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider ${statusColor[event.status] ?? ''}`}>
          {statusLabel[event.status] ?? event.status}
        </span>
      </div>

      {event.matchups.length === 0 ? (
        <p className='mt-3 text-xs text-white/40'>Confrontos ainda não gerados.</p>
      ) : (
        <div className='mt-3 space-y-3'>
          {Array.from(grouped.entries()).map(([key, list]) => (
            <RoundGroup key={key} matchups={list} />
          ))}
        </div>
      )}
    </article>
  );
}

function RoundGroup({ matchups }: { matchups: EventMatchup[] }) {
  const first = matchups[0];
  const roundLabel = first.roundType === 'ODD' ? 'Rodada ÍMPAR' : first.roundType === 'EVEN' ? 'Rodada PAR' : 'Shark Tank';
  return (
    <div className='rounded-lg border border-white/5 bg-white/[0.02] p-3'>
      <p className='text-[10px] font-semibold uppercase tracking-widest text-white/40'>
        Rodada {first.roundNumber} · {roundLabel}
      </p>
      <div className='mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2'>
        {matchups
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((m) => (
            <MatchupCard key={m.id} m={m} />
          ))}
      </div>
    </div>
  );
}

function MatchupCard({ m }: { m: EventMatchup }) {
  const leftWon = m.winnerSide === 'LEFT';
  const rightWon = m.winnerSide === 'RIGHT';
  return (
    <div className='rounded-lg border border-white/10 bg-[#101525] p-3'>
      <div className='flex items-center gap-2 text-xs'>
        <span className={`flex-1 truncate ${leftWon ? 'font-bold text-emerald-300' : 'text-white/70'}`}>
          {m.leftPosition && <span className='mr-1 rounded bg-white/10 px-1 text-[10px] text-white/50'>#{m.leftPosition}</span>}
          {m.leftDriverName ?? '—'}
        </span>
        <span className='text-[10px] font-bold tracking-wider text-white/40'>VS</span>
        <span className={`flex-1 truncate text-right ${rightWon ? 'font-bold text-emerald-300' : 'text-white/70'}`}>
          {m.rightDriverName ?? '—'}
          {m.rightPosition && <span className='ml-1 rounded bg-white/10 px-1 text-[10px] text-white/50'>#{m.rightPosition}</span>}
        </span>
      </div>
      {m.winnerSide && (
        <p className='mt-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-400'>
          Vencedor: {m.winnerSide === 'LEFT' ? m.leftDriverName : m.rightDriverName}
        </p>
      )}
      {m.isManualOverride && !m.winnerSide && (
        <p className='mt-2 text-[10px] font-semibold uppercase tracking-widest text-amber-400'>Ajuste admin.</p>
      )}
    </div>
  );
}
