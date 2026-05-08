'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { ListLogo } from '@/components/list-logo';
import { apiFetch } from '@/lib/api-request';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

type PublicList = {
  id: string;
  areaCode: number;
  name: string;
  format: 'TOP_10' | 'TOP_20';
  administratorName: string | null;
  hometown: string | null;
  active: boolean;
  kingName: string | null;
  rosterCount: number;
  roster: Array<{
    id: string;
    position: number;
    isKing: boolean;
    driverName: string | null;
    driverTeam: string | null;
  }>;
};

type LiveEvent = {
  id: string;
  name: string;
  scheduledAt: string;
  endsAt: string | null;
  status: 'IN_PROGRESS' | 'FINISHED';
  type: 'REGULAR' | 'ARMAGEDDON' | 'SHARK_TANK';
  featured: boolean;
  bannerUrl: string | null;
  list: { id: string; areaCode: number; name: string; format: 'TOP_10' | 'TOP_20' };
  matchups: Array<{ id: string; marketOpen: boolean; settledAt: string | null }>;
};

const TYPE_LABEL: Record<LiveEvent['type'], string> = {
  REGULAR: 'Etapa',
  ARMAGEDDON: 'Armageddon',
  SHARK_TANK: 'Shark Tank',
};

export default function ListasPage() {
  const [lists, setLists] = useState<PublicList[]>([]);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`${apiUrl}/brazil-lists`, { cache: 'no-store' }).then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Falha ao carregar listas (${res.status})${text ? `: ${text.slice(0, 120)}` : ''}`);
        }
        return (await res.json()) as PublicList[];
      }),
      apiFetch(`${apiUrl}/brazil-lists/live-events`, { cache: 'no-store' }).then(async (res) => {
        if (!res.ok) return [] as LiveEvent[];
        return (await res.json()) as LiveEvent[];
      }).catch(() => [] as LiveEvent[]),
    ])
      .then(([l, e]) => { setLists(l); setEvents(e); })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const liveNow = events.filter((e) => e.status === 'IN_PROGRESS');
  const finishedRecent = events.filter((e) => e.status === 'FINISHED');

  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
        <MainNav />

        <section className='mt-2 rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-6 sm:p-8'>
          <div className='flex items-center gap-3 mb-3'>
            <span className='inline-flex items-center rounded-full border border-[#d4a843]/30 bg-[#d4a843]/10 px-3 py-1 text-[10px] font-bold tracking-widest text-[#d4a843]'>
              LISTAS BRASIL
            </span>
            <Link
              href='/regulamento'
              className='text-xs text-white/50 underline-offset-4 transition hover:text-white hover:underline'
            >
              Ver regulamento
            </Link>
          </div>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>Listas Brasil — TOP 10 e TOP 20</h1>
          <p className='mt-2 text-sm text-white/60 sm:text-base'>
            As Listas Brasil reúnem os pilotos titulares de cada região (DDD). Escolha uma lista para ver a grade
            completa, o Rei da região e os próximos embates homologados.
          </p>
          <div className='mt-4 flex items-center gap-3 text-xs text-white/40'>
            <span className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5'>
              {lists.length} lista{lists.length !== 1 ? 's' : ''} ativa{lists.length !== 1 ? 's' : ''}
            </span>
            {liveNow.length > 0 && (
              <span className='inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-emerald-300'>
                <span className='h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400' />
                {liveNow.length} evento{liveNow.length !== 1 ? 's' : ''} ao vivo
              </span>
            )}
          </div>
        </section>

        {(liveNow.length > 0 || finishedRecent.length > 0) && (
          <section className='mt-6'>
            <div className='mb-3 flex items-center justify-between'>
              <h2 className='text-lg font-bold tracking-tight'>
                {liveNow.length > 0 ? 'Eventos ao vivo' : 'Encerrados recentemente'}
              </h2>
            </div>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
              {[...liveNow, ...finishedRecent].slice(0, 9).map((ev) => {
                const isLive = ev.status === 'IN_PROGRESS';
                const openMarkets = ev.matchups.filter((m) => m.marketOpen).length;
                return (
                  <Link
                    key={ev.id}
                    href={`/listas/${ev.list.areaCode}`}
                    className='group rounded-2xl border border-white/10 bg-[#101525] p-4 transition-colors hover:border-white/20'
                  >
                    {ev.bannerUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ev.bannerUrl}
                        alt=''
                        className='mb-3 h-28 w-full rounded-xl object-cover'
                      />
                    )}
                    <div className='flex items-center gap-2 mb-2'>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest ${
                        isLive
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border border-white/10 bg-white/5 text-white/60'
                      }`}>
                        {isLive && <span className='h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400' />}
                        {isLive ? 'AO VIVO' : 'ENCERRADO'}
                      </span>
                      <span className='rounded-full border border-[#d4a843]/30 bg-[#d4a843]/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-[#d4a843]'>
                        {TYPE_LABEL[ev.type]}
                      </span>
                      {ev.featured && (
                        <span className='rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-fuchsia-300'>
                          DESTAQUE
                        </span>
                      )}
                    </div>
                    <p className='text-sm font-semibold leading-tight'>{ev.name}</p>
                    <p className='mt-1 text-[11px] text-white/50'>
                      DDD {ev.list.areaCode} · {ev.list.name}
                    </p>
                    <div className='mt-3 flex items-center justify-between text-[11px] text-white/40'>
                      <span>
                        {new Date(ev.scheduledAt).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                      {isLive && openMarkets > 0 && (
                        <span className='text-emerald-300 font-semibold'>{openMarkets} mercado{openMarkets !== 1 ? 's' : ''} aberto{openMarkets !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {loading && (
          <div className='mt-8 flex flex-col items-center justify-center py-16'>
            <div className='h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60' />
            <p className='mt-4 text-sm text-white/40'>Carregando listas...</p>
          </div>
        )}

        {error && (
          <div className='mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4'>
            <p className='text-sm text-red-200'>{error}</p>
          </div>
        )}

        {!loading && !error && lists.length === 0 && (
          <div className='mt-6 rounded-2xl border border-dashed border-white/10 p-12 text-center'>
            <p className='text-sm text-white/40'>Nenhuma lista ativa no momento.</p>
            <p className='mt-1 text-xs text-white/25'>Assim que as regiões forem homologadas, elas aparecerão aqui.</p>
          </div>
        )}

        <div className='mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {lists.map((list) => (
            <Link
              key={list.id}
              href={`/listas/${list.areaCode}`}
              className='group rounded-2xl border border-white/10 bg-[#101525] p-5 transition-colors hover:border-white/20'
            >
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <div className='flex items-center gap-3'>
                    <ListLogo areaCode={list.areaCode} className='h-12 w-12' />
                    <div>
                      <p className='text-sm font-semibold'>{list.name}</p>
                      <p className='text-[10px] font-semibold uppercase tracking-widest text-white/40'>
                        DDD {list.areaCode} · {list.format === 'TOP_20' ? 'TOP 20' : 'TOP 10'}
                      </p>
                    </div>
                  </div>
                </div>
                <span className='rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-white/60'>
                  {list.rosterCount} / {list.format === 'TOP_20' ? 20 : 10}
                </span>
              </div>

              {list.kingName && (
                <div className='mt-4 rounded-xl border border-[#d4a843]/30 bg-[#d4a843]/10 px-3 py-2'>
                  <p className='text-[10px] font-semibold uppercase tracking-widest text-[#d4a843]'>Rei da região</p>
                  <p className='mt-0.5 text-sm font-bold'>{list.kingName}</p>
                </div>
              )}

              {list.administratorName && (
                <p className='mt-3 text-xs text-white/40'>
                  Administração: <span className='text-white/60'>{list.administratorName}</span>
                </p>
              )}

              <div className='mt-4 flex items-center justify-between text-xs'>
                <span className='text-white/40'>Ver lista completa</span>
                <svg className='h-4 w-4 text-white/40 transition-transform group-hover:translate-x-0.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                  <path strokeLinecap='round' strokeLinejoin='round' d='M9 5l7 7-7 7' />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
