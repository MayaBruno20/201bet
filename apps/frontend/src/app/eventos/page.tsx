'use client';

import { useEffect, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { ApiEvent } from '@/types/events';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3502/api';

export default function EventosPage() {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/events`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Falha ao carregar eventos (${response.status})`);
        }
        return (await response.json()) as ApiEvent[];
      })
      .then((data) => setEvents(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
        <MainNav />

        <section className='mt-8'>
          <p className='text-xs font-bold uppercase tracking-[0.18em] text-amber-300'>Eventos reais</p>
          <h1 className='mt-1 text-3xl font-bold'>Calendário, mercados e embates cadastrados</h1>

          {loading && <p className='mt-5 text-white/70'>Carregando eventos do backend...</p>}
          {error && <p className='mt-5 rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm text-red-100'>{error}</p>}

          <div className='mt-6 space-y-4'>
            {events.map((event) => (
              <article key={event.id} className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div>
                    <h2 className='text-xl font-bold'>{event.name}</h2>
                    <p className='text-sm text-white/70'>
                      {event.sport} • {new Date(event.startAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <span className='rounded-full bg-white/10 px-3 py-1 text-xs font-semibold'>{event.status}</span>
                </div>

                <div className='mt-4 grid gap-3 md:grid-cols-2'>
                  <div className='rounded-xl border border-white/10 bg-white/5 p-4'>
                    <p className='text-sm font-bold text-cyan-300'>Mercados</p>
                    <div className='mt-2 space-y-2'>
                      {event.markets.map((market) => (
                        <div key={market.id} className='rounded-lg border border-white/10 p-3'>
                          <p className='font-semibold'>{market.name}</p>
                          <p className='text-xs text-white/60'>{market.status}</p>
                          <div className='mt-1 text-sm text-white/80'>
                            {market.odds.map((odd) => (
                              <p key={odd.id}>
                                {odd.label}: <span className='font-semibold'>{odd.value.toFixed(2)}</span>
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className='rounded-xl border border-white/10 bg-white/5 p-4'>
                    <p className='text-sm font-bold text-amber-300'>Embates</p>
                    <div className='mt-2 space-y-2'>
                      {event.duels.map((duel) => (
                        <div key={duel.id} className='rounded-lg border border-white/10 p-3'>
                          <p className='font-semibold'>
                            {duel.left.carName} x {duel.right.carName}
                          </p>
                          <p className='text-xs text-white/70'>
                            {duel.left.driverName} x {duel.right.driverName}
                          </p>
                          <p className='text-xs text-white/60'>
                            Fecha booking: {new Date(duel.bookingCloseAt).toLocaleString('pt-BR')} • {duel.status}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {!loading && events.length === 0 && !error && (
              <p className='rounded-xl border border-white/10 bg-white/5 p-4 text-white/70'>
                Nenhum evento encontrado. Execute o seed do banco para popular dados iniciais.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
