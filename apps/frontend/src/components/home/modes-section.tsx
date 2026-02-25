export function ModesSection() {
  const modes = [
    {
      title: 'Passou na frente',
      description: 'Principal booking 50/50 por duelo com trava inteligente e atualização por fluxo.',
    },
    {
      title: 'Vencedor geral do evento',
      description: 'Booking com todos os pilotos elegíveis no evento selecionado.',
    },
    {
      title: 'Reações mais baixas',
      description: 'Mercado específico para melhor tempo de reação na largada.',
    },
    {
      title: 'Reações queimadas',
      description: 'Aposta em ocorrências de queima de largada por bateria e piloto.',
    },
  ];

  return (
    <section id='modalidades' className='mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8'>
      <div className='rounded-2xl border border-white/10 bg-[#101525] p-5 sm:p-6'>
        <p className='text-xs font-bold uppercase tracking-[0.18em] text-emerald-300'>Modalidades da Fase 1</p>
        <div className='mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4'>
          {modes.map((mode) => (
            <article key={mode.title} className='rounded-xl border border-white/10 bg-white/5 p-4'>
              <h5 className='text-base font-bold'>{mode.title}</h5>
              <p className='mt-2 text-sm text-white/75'>{mode.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
