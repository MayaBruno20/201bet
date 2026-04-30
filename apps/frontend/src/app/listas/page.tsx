'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { ListLogo } from '@/components/list-logo';
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

export default function ListasPage() {
  const [lists, setLists] = useState<PublicList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/brazil-lists`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Falha ao carregar listas (${res.status})`);
        return (await res.json()) as PublicList[];
      })
      .then(setLists)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
          </div>
        </section>

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
