import Image from 'next/image';
import Link from 'next/link';
import { EventCard } from '@/types/events';

export function EventsShowcase({ events }: { events: EventCard[] }) {
  return (
    <section id='eventos' className='mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8'>
      <div className='mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4'>
        <div>
          <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30'>Destaques</p>
          <h3 className='mt-3 text-3xl font-semibold tracking-tight'>Próximas Rodadas</h3>
        </div>
        <Link href='/eventos' className='text-sm font-medium text-white/50 hover:text-white transition-colors'>
          Ver todos os eventos &rarr;
        </Link>
      </div>

      {/* Horizontal Scroll no Mobile, Grid no Desktop */}
      <div className='-mx-4 flex overflow-x-auto snap-x snap-mandatory px-4 pb-8 md:mx-0 md:grid md:grid-cols-2 lg:grid-cols-4 md:px-0 md:pb-0 gap-4 md:overflow-visible'>
        {events.map((event) => (
          <article 
            key={event.id} 
            className='group relative flex-none w-[85vw] sm:w-[60vw] md:w-auto overflow-hidden rounded-3xl border border-white/5 bg-[#101525]/30 snap-center transition-all hover:bg-[#101525]/80 hover:border-white/20 hover:-translate-y-1'
          >
            <div className='relative h-56 md:h-48 w-full overflow-hidden'>
              <Image 
                src={event.image} 
                alt={event.title} 
                fill 
                className='object-cover transition-transform duration-700 ease-in-out group-hover:scale-110' 
                sizes='(max-width: 768px) 85vw, (max-width: 1200px) 50vw, 25vw'
              />
              <div className='absolute inset-0 bg-gradient-to-t from-[#090b11] via-[#090b11]/50 to-transparent' />
              <div className='absolute left-4 top-4'>
                <span className='inline-flex rounded-full bg-black/60 backdrop-blur-md px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/80 border border-white/10'>
                  {event.category}
                </span>
              </div>
            </div>

            <div className='relative p-5 pt-0 -mt-8 flex flex-col items-start'>
              <h4 className='line-clamp-2 text-lg font-bold leading-tight'>{event.title}</h4>
              <p className='mt-2 text-sm text-white/60 font-medium flex items-center gap-1.5'>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                {event.date}
              </p>
              <Link 
                href='/apostas'
                className='mt-5 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-center text-sm font-medium text-white/70 transition-all hover:bg-white hover:text-black hover:border-white'
              >
                Acessar Booking
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
