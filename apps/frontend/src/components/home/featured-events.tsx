'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getPublicApiUrl } from '@/lib/env-public';
import { EventBanner, isVideoBanner } from '@/components/event-banner';

const apiUrl = getPublicApiUrl();

type FeaturedEvent = {
  id: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  startAt: string;
  status: string;
  sport: string;
  featured: boolean;
};

export function FeaturedEvents() {
  const [events, setEvents] = useState<FeaturedEvent[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiUrl}/events/featured`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setEvents(data ?? []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  // Auto-rotate carousel a cada 6s
  useEffect(() => {
    if (events.length <= 1) return;
    const t = setInterval(() => setActiveIdx((i) => (i + 1) % events.length), 6000);
    return () => clearInterval(t);
  }, [events.length]);

  if (loading) return null;
  if (events.length === 0) return null;

  const active = events[activeIdx];

  return (
    <section className='mx-auto max-w-7xl px-3 sm:px-6 lg:px-8 mt-4'>
      <div className='mb-3 flex items-center justify-between'>
        <p className='text-[10px] sm:text-xs font-bold uppercase tracking-widest text-[#d4a843]/80'>
          🔥 Em destaque
        </p>
        <p className='text-[10px] text-white/30'>{events.length} {events.length === 1 ? 'evento' : 'eventos'}</p>
      </div>

      {/* Hero card grande */}
      <Link
        href='/eventos'
        className='block group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/10 bg-[#101525] aspect-[16/9] sm:aspect-[21/9] max-h-[500px]'
      >
        {/* Banner background (imagem ou vídeo Vimeo/YouTube) */}
        {active.bannerUrl ? (
          <>
            <div key={active.id} className='absolute inset-0 w-full h-full overflow-hidden'>
              <EventBanner
                url={active.bannerUrl}
                alt={active.name}
                className='absolute inset-0 w-full h-full object-cover'
              />
            </div>
            <div className='pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090b11] via-[#090b11]/60 to-transparent' />
            <div className='pointer-events-none absolute inset-0 bg-gradient-to-r from-[#090b11]/80 via-transparent to-transparent' />
          </>
        ) : (
          <>
            <div className='absolute inset-0 bg-gradient-to-br from-blue-500/10 via-[#101525] to-orange-500/10' />
            <div className='absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl' />
            <div className='absolute -left-32 -bottom-32 h-96 w-96 rounded-full bg-orange-500/10 blur-3xl' />
          </>
        )}

        {/* Content */}
        <div className='relative h-full flex flex-col justify-end p-4 sm:p-6 md:p-10'>
          <div className='flex flex-wrap items-center gap-2 mb-2 sm:mb-3'>
            {active.featured && (
              <span className='inline-flex items-center rounded-full bg-[#d4a843]/20 border border-[#d4a843]/40 px-2.5 py-1 text-[10px] font-bold tracking-wider text-[#d4a843]'>
                ⭐ DESTAQUE
              </span>
            )}
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider ${
              active.status === 'LIVE' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 animate-pulse' :
              'bg-blue-500/15 text-blue-400 border-blue-500/30'
            }`}>
              {active.status === 'LIVE' ? '🔴 AO VIVO' : 'AGENDADO'}
            </span>
            <span className='inline-flex items-center gap-1.5 text-xs text-white/70'>
              <svg className='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' />
              </svg>
              {new Date(active.startAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
            </span>
            <span className='inline-flex items-center gap-1.5 text-xs text-white/70'>
              <svg className='h-3.5 w-3.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' />
              </svg>
              {new Date(active.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          <h2 className='text-xl sm:text-3xl md:text-5xl font-bold tracking-tight max-w-3xl'>
            {active.name}
          </h2>

          {active.description && (
            <p className='mt-2 text-sm sm:text-base text-white/70 max-w-2xl line-clamp-2'>
              {active.description}
            </p>
          )}

          <div className='mt-4 sm:mt-6 inline-flex items-center gap-2 self-start rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.2)] transition group-hover:bg-white/90 group-hover:scale-[1.02]'>
            Ver evento
            <svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
              <path strokeLinecap='round' strokeLinejoin='round' d='M14 5l7 7m0 0l-7 7m7-7H3' />
            </svg>
          </div>
        </div>

        {/* Carousel dots */}
        {events.length > 1 && (
          <div className='absolute right-3 top-3 sm:right-6 sm:top-6 flex gap-1.5'>
            {events.map((_, i) => (
              <button
                key={i}
                type='button'
                onClick={(e) => { e.preventDefault(); setActiveIdx(i); }}
                aria-label={`Ver destaque ${i + 1}`}
                className={`h-2 rounded-full transition-all ${i === activeIdx ? 'w-8 bg-white' : 'w-2 bg-white/30 hover:bg-white/50'}`}
              />
            ))}
          </div>
        )}
      </Link>

      {/* Mini cards dos demais featured (mobile-friendly) */}
      {events.length > 1 && (
        <div className='mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2'>
          {events.slice(0, 4).map((ev, i) => (
            <button
              key={ev.id}
              type='button'
              onClick={() => setActiveIdx(i)}
              className={`group relative overflow-hidden rounded-xl aspect-video border transition-all ${i === activeIdx ? 'border-white/40 ring-1 ring-white/20' : 'border-white/10 hover:border-white/25 opacity-70 hover:opacity-100'}`}
            >
              {ev.bannerUrl ? (
                isVideoBanner(ev.bannerUrl) ? (
                  <div className='absolute inset-0 w-full h-full overflow-hidden'>
                    <EventBanner url={ev.bannerUrl} alt={ev.name} className='absolute inset-0 w-full h-full object-cover' />
                  </div>
                ) : (
                  <img src={ev.bannerUrl} alt={ev.name} className='w-full h-full object-cover' />
                )
              ) : (
                <div className='w-full h-full bg-gradient-to-br from-blue-500/20 to-orange-500/20' />
              )}
              <div className='absolute inset-0 bg-gradient-to-t from-black/80 to-transparent' />
              <p className='absolute bottom-1 left-2 right-2 text-[10px] sm:text-xs font-semibold text-white truncate text-left'>
                {ev.name}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
