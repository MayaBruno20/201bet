'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { AnimatedContent } from '@/components/animations/AnimatedContent';
import { SpotlightCard } from '@/components/animations/SpotlightCard';

const modes = [
  {
    title: 'Passou na frente',
    description: 'Principal booking por duelo com trava inteligente e atualização rápida de odds.',
    gradient: 'from-emerald-500/20 to-emerald-500/5',
    iconColor: 'text-emerald-400',
    glowColor: 'rgba(16,185,129,0.12)',
    icon: (
      <svg fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor' className='w-6 h-6'>
        <path strokeLinecap='round' strokeLinejoin='round' d='M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z' />
      </svg>
    ),
  },
  {
    title: 'Vencedor geral',
    description: 'Modalidade de booking com todos os pilotos elegíveis na competição selecionada.',
    gradient: 'from-amber-500/20 to-amber-500/5',
    iconColor: 'text-amber-400',
    glowColor: 'rgba(245,158,11,0.12)',
    icon: (
      <svg fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor' className='w-6 h-6'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0'
        />
      </svg>
    ),
  },
  {
    title: 'Reações mais baixas',
    description: 'Mercado específico focado apenas no melhor tempo de reação na puxada.',
    gradient: 'from-blue-500/20 to-blue-500/5',
    iconColor: 'text-blue-400',
    glowColor: 'rgba(59,130,246,0.12)',
    icon: (
      <svg fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor' className='w-6 h-6'>
        <path strokeLinecap='round' strokeLinejoin='round' d='M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z' />
      </svg>
    ),
  },
  {
    title: 'Reações queimadas',
    description: 'Aposta em ocorrências de queima de largada generalizada ou piloto fixo.',
    gradient: 'from-red-500/20 to-red-500/5',
    iconColor: 'text-red-400',
    glowColor: 'rgba(239,68,68,0.12)',
    icon: (
      <svg fill='none' viewBox='0 0 24 24' strokeWidth={1.5} stroke='currentColor' className='w-6 h-6'>
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z'
        />
        <path
          strokeLinecap='round'
          strokeLinejoin='round'
          d='M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z'
        />
      </svg>
    ),
  },
];

export function ModesSection() {
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  const bgY = useTransform(scrollYProgress, [0, 1], ['-8%', '8%']);

  return (
    <section ref={sectionRef} id='modalidades' className='relative overflow-hidden py-20'>
      {/* Cinematic Background */}
      <motion.div style={{ y: bgY }} className='absolute inset-[-15%] -z-10'>
        <Image
          src='/images/hero/Captura de tela 2026-04-01 205828.png'
          alt=''
          fill
          className='object-cover object-center'
        />
      </motion.div>
      {/* Dark overlays for readability */}
      <div className='absolute inset-0 -z-10 bg-[#090b11]/80' />
      <div className='absolute inset-0 -z-10 bg-gradient-to-b from-[#090b11] via-transparent to-[#090b11]' />
      <div className='absolute inset-0 -z-10 bg-gradient-to-r from-[#090b11]/40 via-transparent to-[#090b11]/40' />

      <div className='mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'>
        <AnimatedContent distance={30}>
          <div className='flex flex-col md:flex-row md:items-end md:justify-between mb-12 gap-4'>
            <div>
              <p className='text-[10px] font-bold uppercase tracking-[0.3em] text-white/30'>Nossas opções</p>
              <h3 className='mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl'>Modalidades Fase 1</h3>
            </div>
            <Link
              href='/apostas'
              className='group text-sm font-bold text-white/40 hover:text-white transition-all flex items-center gap-2 self-start md:self-auto'
            >
              Começar a apostar
              <span className='transition-transform group-hover:translate-x-1'>&rarr;</span>
            </Link>
          </div>
        </AnimatedContent>

        <div className='grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'>
          {modes.map((mode, index) => (
            <AnimatedContent key={mode.title} delay={index * 0.1} distance={40}>
              <SpotlightCard className='h-full' spotlightColor={mode.glowColor}>
                <article className='group relative h-full flex flex-col p-6 bg-transparent min-h-[200px] sm:min-h-[220px]'>
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    whileTap={{ scale: 0.95 }}
                    className={`relative z-10 mb-5 flex h-13 w-13 items-center justify-center rounded-[18px] bg-white/5 ${mode.iconColor} border border-white/10 transition-colors group-hover:bg-white/10 group-hover:border-white/20`}
                    style={{ width: '52px', height: '52px' }}
                  >
                    {mode.icon}
                  </motion.div>

                  <h5 className='relative z-10 text-lg font-bold text-white group-hover:text-blue-400 transition-colors'>
                    {mode.title}
                  </h5>
                  <p className='relative z-10 mt-3 text-sm leading-relaxed text-white/40 group-hover:text-white/65 transition-colors flex-1'>
                    {mode.description}
                  </p>
                </article>
              </SpotlightCard>
            </AnimatedContent>
          ))}
        </div>
      </div>
    </section>
  );
}
