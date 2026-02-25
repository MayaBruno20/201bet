import Image from 'next/image';

export function HeroSection() {
  return (
    <section className='relative isolate overflow-hidden border-b border-white/10'>
      <Image src='/images/hero/armageddon-track.jpg' alt='Pista de arrancada Armageddon' fill priority className='object-cover object-center' />
      <div className='absolute inset-0 bg-gradient-to-b from-black/75 via-black/65 to-[#090b11]' />

      <div className='relative mx-auto max-w-7xl px-4 pb-14 pt-16 sm:px-6 lg:px-8'>
        <p className='mb-3 inline-flex rounded-full border border-amber-300/50 bg-amber-300/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-200'>
          Mercado 50/50 ativo
        </p>
        <h1 className='max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl'>No mundo da arrancada, quem larga primeiro vence.</h1>
        <p className='mt-4 max-w-2xl text-base text-white/80 sm:text-lg'>
          Entre na conta, escolha seu booking e aposte ao vivo nos eventos do Armageddon e campeonatos parceiros. Odds dinâmicas,
          atualização instantânea e painel financeiro centralizado.
        </p>
      </div>
    </section>
  );
}
