import Image from 'next/image';
import Link from 'next/link';

export function HeroSection() {
  return (
    <section className='relative isolate overflow-hidden'>
      <Image src='/images/hero/armageddon-track.jpg' alt='Pista de arrancada Armageddon' fill priority className='object-cover object-center' />
      {/* Immersive Dark Gradient */}
      <div className='absolute inset-0 bg-gradient-to-b from-[#090b11]/90 via-[#090b11]/60 to-[#090b11]' />
      {/* Subtle radial glow */}
      <div className='absolute left-1/2 top-1/3 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-blue-500/[0.03] blur-[120px]' />

      <div className='relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 md:py-32'>
        <div className='flex flex-col items-start'>
          <p className='mb-6 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white/60 backdrop-blur-md'>
            <span className='mr-2 h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse'></span>
            Mercado 50/50 ativo
          </p>

          <h1 className='max-w-3xl text-4xl font-extrabold leading-[1.1] text-white sm:text-5xl md:text-6xl lg:text-7xl'>
            No mundo da arrancada, <br className='hidden md:block' />
            <span className='text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/40'>quem larga primeiro vence.</span>
          </h1>

          <p className='mt-6 max-w-2xl text-base leading-relaxed text-white/50 sm:text-lg lg:text-xl'>
            Entre na conta, escolha seu booking e aposte ao vivo nos eventos do Armageddon e campeonatos parceiros.
          </p>

          <div className='mt-10 flex flex-wrap items-center gap-4'>
            <Link
              href='/apostas'
              className='group inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-8 py-4 text-sm font-bold text-black shadow-[0_0_30px_rgba(255,255,255,0.15)] transition-all hover:shadow-[0_0_40px_rgba(255,255,255,0.25)] hover:scale-[1.02] hover:-translate-y-0.5'
            >
              Apostar Agora
              <svg className='h-4 w-4 transition-transform group-hover:translate-x-0.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M13 7l5 5m0 0l-5 5m5-5H6' />
              </svg>
            </Link>
            <Link
              href='#eventos'
              className='inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-sm font-medium text-white/70 backdrop-blur-md transition-all hover:bg-white/10 hover:text-white hover:border-white/20'
            >
              Ver Eventos
            </Link>
          </div>

          {/* Stats Bar */}
          <div className='mt-16 flex flex-wrap items-center gap-6 sm:gap-10'>
            <div>
              <p className='text-2xl font-bold tracking-tight sm:text-3xl'>50/50</p>
              <p className='mt-1 text-[10px] font-medium uppercase tracking-widest text-white/30'>Mercado justo</p>
            </div>
            <div className='h-8 w-px bg-white/10 hidden sm:block' />
            <div>
              <p className='text-2xl font-bold tracking-tight sm:text-3xl'>201m</p>
              <p className='mt-1 text-[10px] font-medium uppercase tracking-widest text-white/30'>Pista oficial</p>
            </div>
            <div className='h-8 w-px bg-white/10 hidden sm:block' />
            <div>
              <p className='text-2xl font-bold tracking-tight sm:text-3xl'>Ao vivo</p>
              <p className='mt-1 text-[10px] font-medium uppercase tracking-widest text-white/30'>Odds dinâmicas</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
