'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { AnimatedContent } from '@/components/animations/AnimatedContent';
import { ShinyText } from '@/components/animations/ShinyText';

const heroImages = [
  '/images/hero/armageddon-track.jpg',
  '/images/hero/Captura de tela 2026-04-01 204252.png',
  '/images/hero/Captura de tela 2026-04-01 204407.png',
  '/images/hero/Captura de tela 2026-04-01 204438.png',
  '/images/hero/Captura de tela 2026-04-01 204444.png',
  '/images/hero/Captura de tela 2026-04-01 204518.png',
  '/images/hero/Captura de tela 2026-04-01 204607.png',
  '/images/hero/Captura de tela 2026-04-01 204633.png',
  '/images/hero/Captura de tela 2026-04-01 204736.png',
  '/images/hero/Captura de tela 2026-04-01 205012.png',
  '/images/hero/Captura de tela 2026-04-01 205038.png',
  '/images/hero/Captura de tela 2026-04-01 205109.png',
  '/images/hero/Captura de tela 2026-04-01 205129.png',
  '/images/hero/Captura de tela 2026-04-01 205221.png',
  '/images/hero/Captura de tela 2026-04-01 205341.png',
  '/images/hero/Captura de tela 2026-04-01 205643.png',
  '/images/hero/Captura de tela 2026-04-01 205828.png',
];

// Ken Burns: zoom + pan em direção diferente por imagem
const kenBurnsPresets = [
  { initial: { scale: 1.18, x: '-4%', y: '-3%' }, animate: { scale: 1.04, x: '4%',  y: '3%'  } },
  { initial: { scale: 1.18, x: '4%',  y: '-3%' }, animate: { scale: 1.04, x: '-4%', y: '3%'  } },
  { initial: { scale: 1.2,  x: '0%',  y: '-5%' }, animate: { scale: 1.04, x: '0%',  y: '5%'  } },
  { initial: { scale: 1.2,  x: '0%',  y: '5%'  }, animate: { scale: 1.04, x: '0%',  y: '-5%' } },
  { initial: { scale: 1.18, x: '-5%', y: '0%'  }, animate: { scale: 1.04, x: '5%',  y: '0%'  } },
  { initial: { scale: 1.18, x: '5%',  y: '0%'  }, animate: { scale: 1.04, x: '-5%', y: '0%'  } },
];

export function HeroSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  const backgroundY    = useTransform(scrollYProgress, [0, 1], ['0%', '20%']);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);
  const contentY       = useTransform(scrollYProgress, [0, 1], ['0%', '12%']);

  const advance = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % heroImages.length);
  }, []);

  useEffect(() => {
    const id = setInterval(advance, 5500);
    return () => clearInterval(id);
  }, [advance]);

  const kb = kenBurnsPresets[currentIndex % kenBurnsPresets.length];

  return (
    <section
      ref={sectionRef}
      className='relative isolate overflow-hidden min-h-[100svh] flex items-center bg-[#090b11]'
    >
      {/* ── Background: slideshow + efeitos ── */}
      <motion.div style={{ y: backgroundY }} className='absolute inset-0 -z-10'>

        {/* Crossfade + Ken Burns */}
        <AnimatePresence mode='sync'>
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: kb.initial.scale, x: kb.initial.x, y: kb.initial.y }}
            animate={{ opacity: 1, scale: kb.animate.scale, x: kb.animate.x, y: kb.animate.y }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 1.8, ease: 'easeInOut' },
              scale:   { duration: 8,   ease: 'linear' },
              x:       { duration: 8,   ease: 'linear' },
              y:       { duration: 8,   ease: 'linear' },
            }}
            className='absolute inset-0'
          >
            <Image
              src={heroImages[currentIndex]}
              alt={`Armageddon corrida ${currentIndex + 1}`}
              fill
              priority={currentIndex === 0}
              className='object-cover object-center brightness-[1.12] contrast-[1.15] saturate-[1.3]'
            />
          </motion.div>
        </AnimatePresence>

        {/* Flash de luz diagonal na troca */}
        <motion.div
          key={`sweep-${currentIndex}`}
          initial={{ x: '-100%' }}
          animate={{ x: '200%' }}
          transition={{ duration: 0.85, ease: [0.25, 0.1, 0.25, 1], delay: 0.05 }}
          className='absolute inset-0 pointer-events-none'
          style={{
            background:
              'linear-gradient(108deg, transparent 20%, rgba(255,255,255,0.22) 50%, transparent 80%)',
          }}
        />

        {/* Color grade cinemático (tom azul-frio) */}
        <div className='absolute inset-0 pointer-events-none bg-blue-950/30 mix-blend-multiply' />

        {/* Vignette: bordas escuras, centro vivo */}
        <div
          className='absolute inset-0 pointer-events-none'
          style={{
            background:
              'radial-gradient(ellipse at 50% 45%, transparent 40%, rgba(9,11,17,0.80) 100%)',
          }}
        />
      </motion.div>

      {/* Gradientes para legibilidade do texto */}
      <div className='absolute inset-0 bg-gradient-to-b from-[#090b11]/80 via-[#090b11]/25 to-[#090b11]' />
      <div className='absolute inset-0 bg-gradient-to-r from-[#090b11]/85 via-[#090b11]/15 to-transparent' />

      {/* Glows */}
      <motion.div
        animate={{ scale: [1, 1.25, 1], opacity: [0.05, 0.12, 0.05] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className='absolute left-1/4 top-1/3 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-blue-500 blur-[130px] pointer-events-none'
      />
      <motion.div
        animate={{ scale: [1, 1.4, 1], opacity: [0.03, 0.07, 0.03] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className='absolute right-0 bottom-1/4 h-[350px] w-[550px] rounded-full bg-emerald-500 blur-[110px] pointer-events-none'
      />

      {/* ── Conteúdo ── */}
      <motion.div
        style={{ y: contentY, opacity: contentOpacity }}
        className='relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 md:py-36 w-full'
      >
        <div className='flex flex-col items-start max-w-3xl'>

          <AnimatedContent distance={20} delay={0.1}>
            <div className='mb-6 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white/80 backdrop-blur-xl'>
              <span className='mr-2.5 h-2 w-2 rounded-full bg-emerald-400 animate-ping' />
            </div>
          </AnimatedContent>

          <AnimatedContent distance={40} delay={0.3}>
            <h1 className='text-5xl font-extrabold leading-[1.05] text-white sm:text-6xl md:text-7xl lg:text-8xl tracking-tight'>
              No mundo da arrancada,{' '}
              <br className='hidden md:block' />
              <span className='text-transparent bg-clip-text bg-gradient-to-br from-blue-400 via-white to-white/20'>
                quem larga primeiro vence.
              </span>
            </h1>
          </AnimatedContent>

          <AnimatedContent distance={30} delay={0.5}>
            <p className='mt-6 max-w-xl text-base leading-relaxed text-white/55 sm:text-lg lg:text-xl font-light'>
              Entre na conta, escolha seu booking e aposte ao vivo nos eventos do Armageddon e campeonatos parceiros.
            </p>
          </AnimatedContent>

          <AnimatedContent distance={20} delay={0.7}>
            <div className='mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto'>
              <Link
                href='/apostas'
                className='group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-2xl bg-white px-8 py-4 text-base font-bold text-black transition-all hover:scale-[1.03] active:scale-[0.97]'
              >
                <div className='absolute inset-0 bg-gradient-to-r from-transparent via-black/5 to-transparent -translate-x-full group-hover:animate-shimmer' />
                Apostar Agora
                <svg
                  className='h-5 w-5 shrink-0 transition-transform group-hover:translate-x-1'
                  fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2.5}
                >
                  <path strokeLinecap='round' strokeLinejoin='round' d='M13 7l5 5m0 0l-5 5m5-5H6' />
                </svg>
              </Link>
              <Link
                href='#eventos'
                className='inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-8 py-4 text-base font-semibold text-white/70 backdrop-blur-xl transition-all hover:bg-white/10 hover:text-white hover:border-white/30 active:scale-[0.97]'
              >
                Explorar Eventos
              </Link>
            </div>
          </AnimatedContent>

          <AnimatedContent distance={20} delay={0.9} threshold={0}>
            <div className='mt-16 flex flex-wrap items-center gap-6 sm:gap-12'>
              <div className='h-8 w-px bg-white/10 rotate-12 hidden sm:block' />
              <div className='group cursor-default'>
                <p className='text-2xl font-black tracking-tighter sm:text-3xl group-hover:text-blue-400 transition-colors'>201m</p>
                <p className='mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 group-hover:text-white/50 transition-colors'>Pista oficial</p>
              </div>
              <div className='h-8 w-px bg-white/10 rotate-12 hidden sm:block' />
              <div className='group cursor-default'>
                <p className='text-2xl font-black tracking-tighter sm:text-3xl group-hover:text-amber-400 transition-colors'>Ao vivo</p>
                <p className='mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 group-hover:text-white/50 transition-colors'>Odds dinâmicas</p>
              </div>
            </div>
          </AnimatedContent>

        </div>
      </motion.div>

      {/* Scroll hint desktop */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        className='absolute bottom-10 right-8 hidden lg:flex flex-col items-center gap-1.5 opacity-25'
      >
        <span className='text-[9px] font-bold uppercase tracking-[0.3em] text-white -rotate-90 mb-2'>scroll</span>
        <svg className='w-4 h-4 text-white' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
          <path strokeLinecap='round' strokeLinejoin='round' d='M19 9l-7 7-7-7' />
        </svg>
      </motion.div>
    </section>
  );
}
