'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiEvent } from '@/types/events';
import { AnimatedContent } from '@/components/animations/AnimatedContent';
import { SpotlightCard } from '@/components/animations/SpotlightCard';
import { FrameBorder } from '@/components/animations/FrameBorder';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

const eventImages = [
  '/images/events/event-1.jpg',
  '/images/events/event-2.jpg',
  '/images/events/event-3.jpg',
  '/images/events/event-4.jpg',
];

type DisplayEvent = {
  id: string;
  title: string;
  date: string;
  category: string;
  image: string;
};

function mapEvent(event: ApiEvent, index: number): DisplayEvent {
  const date = new Date(event.startAt);
  const formattedDate = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  }) + ', ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const marketNames = event.markets?.map((m) => m.name).filter(Boolean) ?? [];
  const category = marketNames[0] ?? (event.sport || 'Evento');
  return {
    id: event.id,
    title: event.name,
    date: formattedDate.replace('.', ''),
    category,
    image: eventImages[index % eventImages.length],
  };
}

export function EventsShowcase() {
  const [events, setEvents] = useState<DisplayEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${apiUrl}/events`);
        if (!response.ok) return;
        const data = (await response.json()) as ApiEvent[];
        if (cancelled) return;
        const now = Date.now();
        const upcoming = data
          .filter((ev) => ev.status !== 'FINISHED' && ev.status !== 'CANCELED')
          .sort((a, b) => {
            const aTime = new Date(a.startAt).getTime();
            const bTime = new Date(b.startAt).getTime();
            const aFuture = aTime >= now;
            const bFuture = bTime >= now;
            if (aFuture !== bFuture) return aFuture ? -1 : 1;
            return aTime - bTime;
          })
          .slice(0, 4)
          .map(mapEvent);
        setEvents(upcoming);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && events.length === 0) return null;

  return (
    <section id='eventos' className='py-16 overflow-hidden'>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        <AnimatedContent distance={30} threshold={0.2}>
          <div className='mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4'>
            <div>
              <p className='text-[10px] font-bold uppercase tracking-[0.3em] text-white/30'>
                Destaques exclusivos
              </p>
              <h3 className='mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl'>
                Próximas Rodadas
              </h3>
            </div>
            <Link
              href='/eventos'
              className='group text-sm font-bold text-white/40 hover:text-white transition-all flex items-center gap-2 self-start md:self-auto'
            >
              Ver todos os eventos
              <span className='transition-transform group-hover:translate-x-1'>&rarr;</span>
            </Link>
          </div>
        </AnimatedContent>

        {loading ? (
          <div className='flex items-center justify-center py-16'>
            <div className='h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/60' />
          </div>
        ) : (
          <>
            {/* Horizontal Scroll on Mobile, Grid on Desktop */}
            <div className='-mx-4 sm:-mx-0 flex overflow-x-auto snap-x snap-proximity px-4 sm:px-0 pb-6 md:pb-0 md:grid md:grid-cols-2 lg:grid-cols-4 gap-5 md:overflow-visible scrollbar-hide'>
              {events.map((event, index) => {
                const CardContent = (
                  <SpotlightCard
                    className='group flex-none w-[82vw] sm:w-[60vw] md:w-auto h-full'
                    spotlightColor='rgba(59, 130, 246, 0.15)'
                  >
                    <article className='relative flex flex-col h-full bg-transparent overflow-hidden rounded-[22px]'>
                      <div className='relative h-56 md:h-48 w-full overflow-hidden'>
                        <Image
                          src={event.image}
                          alt={event.title}
                          fill
                          className='object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-110'
                          sizes='(max-width: 768px) 82vw, (max-width: 1200px) 50vw, 25vw'
                        />
                        <div className='absolute inset-0 bg-gradient-to-t from-[#090b11] via-[#090b11]/15 to-transparent' />
                        <div className='absolute left-4 top-4 flex items-center gap-2'>
                          <span className='inline-flex rounded-full bg-black/50 backdrop-blur-md px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/90 border border-white/10'>
                            {event.category}
                          </span>
                          {index === 0 && (
                            <span className='inline-flex animate-pulse rounded-full bg-blue-500/25 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-blue-400 border border-blue-500/25'>
                              Destaque
                            </span>
                          )}
                        </div>
                      </div>

                      <div className='relative p-5 pt-0 -mt-8 flex flex-col flex-1 pointer-events-none'>
                        <div className='bg-[#0d1626]/85 backdrop-blur-xl rounded-2xl p-5 border border-white/5 group-hover:border-white/10 transition-all duration-300 pointer-events-auto'>
                          <h4 className='line-clamp-2 text-lg font-bold leading-tight group-hover:text-blue-400 transition-colors'>
                            {event.title}
                          </h4>
                          <p className='mt-2.5 text-sm text-white/50 font-bold flex items-center gap-2'>
                            <svg
                              width='13' height='13' viewBox='0 0 24 24' fill='none'
                              stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'
                              className='text-blue-500 shrink-0'
                            >
                              <rect x='3' y='4' width='18' height='18' rx='2' ry='2' />
                              <line x1='16' y1='2' x2='16' y2='6' />
                              <line x1='8' y1='2' x2='8' y2='6' />
                              <line x1='3' y1='10' x2='21' y2='10' />
                            </svg>
                            {event.date}
                          </p>
                          <Link
                            href='/apostas'
                            className='mt-5 block w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3.5 text-center text-sm font-bold text-white transition-all hover:bg-white hover:text-black hover:scale-[1.02] active:scale-[0.97] touch-manipulation'
                          >
                            Acessar Booking
                          </Link>
                        </div>
                      </div>
                    </article>
                  </SpotlightCard>
                );

                return (
                  <AnimatedContent key={event.id} delay={index * 0.1} distance={40} threshold={0.1} className='snap-start'>
                    {index === 0 ? (
                      <FrameBorder padding='p-0.5' className='rounded-3xl border-0 overflow-hidden h-full'>
                        {CardContent}
                      </FrameBorder>
                    ) : (
                      CardContent
                    )}
                  </AnimatedContent>
                );
              })}
            </div>

            <p className='mt-4 text-center text-[10px] font-bold uppercase tracking-widest text-white/20 md:hidden'>
              deslize para ver mais &rarr;
            </p>
          </>
        )}
      </div>
    </section>
  );
}
