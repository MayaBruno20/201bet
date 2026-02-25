import Image from 'next/image';
import { EventCard } from '@/types/events';

export function EventsShowcase({ events }: { events: EventCard[] }) {
  return (
    <section id='eventos' className='mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8'>
      <div className='mb-5 flex items-end justify-between gap-4'>
        <div>
          <p className='text-xs font-bold uppercase tracking-[0.18em] text-amber-300'>Eventos em destaque</p>
          <h3 className='mt-1 text-2xl font-bold'>Booking aberto para próximas rodadas</h3>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        {events.map((event) => (
          <article key={event.id} className='group relative overflow-hidden rounded-2xl border border-white/10'>
            <div className='relative h-48'>
              <Image src={event.image} alt={event.title} fill className='object-cover transition duration-500 group-hover:scale-105' />
              <div className='absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent' />
            </div>

            <div className='absolute bottom-0 left-0 right-0 p-4'>
              <p className='mb-2 inline-flex rounded-full bg-amber-300 px-2 py-1 text-[11px] font-bold text-black'>{event.category}</p>
              <h4 className='line-clamp-2 text-base font-bold'>{event.title}</h4>
              <p className='mt-1 text-xs text-white/70'>{event.date}</p>
              <button className='mt-3 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-extrabold text-black transition hover:bg-emerald-300'>
                Apostar
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
