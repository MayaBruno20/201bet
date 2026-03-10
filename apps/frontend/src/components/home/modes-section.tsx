import Link from 'next/link';

export function ModesSection() {
  const modes = [
    {
      title: 'Passou na frente',
      description: 'Principal booking 50/50 por duelo com trava inteligente e atualização rápida de odds.',
      gradient: 'from-emerald-500/20 to-emerald-500/5',
      iconColor: 'text-emerald-400',
      borderHover: 'group-hover:border-emerald-500/20',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      )
    },
    {
      title: 'Vencedor geral',
      description: 'Modalidade de booking com todos os pilotos elegíveis na competição selecionada.',
      gradient: 'from-amber-500/20 to-amber-500/5',
      iconColor: 'text-amber-400',
      borderHover: 'group-hover:border-amber-500/20',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" />
        </svg>
      )
    },
    {
      title: 'Reações mais baixas',
      description: 'Mercado específico focado apenas no melhor tempo de reação na puxada.',
      gradient: 'from-blue-500/20 to-blue-500/5',
      iconColor: 'text-blue-400',
      borderHover: 'group-hover:border-blue-500/20',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      title: 'Reações queimadas',
      description: 'Aposta em ocorrências de queima de largada generalizada ou piloto fixo.',
      gradient: 'from-red-500/20 to-red-500/5',
      iconColor: 'text-red-400',
      borderHover: 'group-hover:border-red-500/20',
      icon: (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
        </svg>
      )
    },
  ];

  return (
    <section id='modalidades' className='mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 pt-8'>
      <div className='flex flex-col md:flex-row md:items-end md:justify-between mb-10 gap-4'>
        <div>
          <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30'>Nossas opções</p>
          <h3 className='mt-3 text-3xl font-semibold tracking-tight'>Modalidades Fase 1</h3>
        </div>
        <Link href='/apostas' className='text-sm font-medium text-white/40 hover:text-white transition-colors'>
          Começar a apostar &rarr;
        </Link>
      </div>
      
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        {modes.map((mode) => (
          <article 
            key={mode.title} 
            className={`group relative overflow-hidden rounded-3xl border border-white/5 bg-[#101525]/30 p-6 transition-all duration-500 hover:bg-[#101525]/80 hover:border-white/10 ${mode.borderHover} hover:-translate-y-1`}
          >
            {/* Gradient glow on hover */}
            <div className={`absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${mode.gradient} opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100`} />
            
            <div className={`relative z-10 mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 ${mode.iconColor} border border-white/5 transition-colors group-hover:bg-white/10`}>
              {mode.icon}
            </div>
            
            <h5 className='relative z-10 text-lg font-medium text-white'>{mode.title}</h5>
            <p className='relative z-10 mt-3 text-sm leading-relaxed text-white/40 group-hover:text-white/60 transition-colors'>{mode.description}</p>
            
            {/* Bottom arrow hint */}
            <div className='relative z-10 mt-5 flex items-center gap-2 text-xs font-medium text-white/20 group-hover:text-white/50 transition-colors'>
              <span>Saiba mais</span>
              <svg className='h-3 w-3 transition-transform group-hover:translate-x-1' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M13 7l5 5m0 0l-5 5m5-5H6' />
              </svg>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
