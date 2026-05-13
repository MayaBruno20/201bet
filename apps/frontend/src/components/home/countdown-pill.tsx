'use client';

import * as React from 'react';
import { Clock, Radio, Flame, AlarmClock } from 'lucide-react';

/**
 * 201bet — CountdownPill
 * Compact pill counting down to an event start / booking close.
 * Visual state shifts as the deadline approaches.
 */

export interface CountdownPillProps {
  targetDate: Date | string;
  label?: string;
  /** Behavior once targetDate is in the past. */
  onLive?: 'show-live' | 'hide';
  className?: string;
}

type Phase = 'cold' | 'hot' | 'urgent' | 'live' | 'hidden';

interface CountdownState {
  phase: Phase;
  text: string;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function compute(target: Date, onLive: 'show-live' | 'hide'): CountdownState {
  const now = Date.now();
  const diffMs = target.getTime() - now;

  if (diffMs <= 0) {
    if (onLive === 'hide') return { phase: 'hidden', text: '' };
    return { phase: 'live', text: 'AO VIVO AGORA' };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (totalSeconds < 5 * 60) {
    return {
      phase: 'urgent',
      text: `ÚLTIMOS ${minutes}m ${pad(seconds)}s`,
    };
  }
  if (totalSeconds < 30 * 60) {
    return {
      phase: 'hot',
      text: `FECHA EM ${minutes}min`,
    };
  }
  if (hours >= 1) {
    return {
      phase: 'cold',
      text: `começa em ${pad(hours)}h ${pad(minutes)}min`,
    };
  }
  return {
    phase: 'cold',
    text: `começa em ${minutes}min`,
  };
}

const PHASE_STYLES: Record<Exclude<Phase, 'hidden'>, string> = {
  cold:
    'bg-[rgba(255,176,40,0.10)] text-[#ffd887] border-[rgba(255,176,40,0.25)] ' +
    'shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
  hot:
    'text-[#1a1305] bg-[linear-gradient(180deg,#ffc55a,#ff8a2a)] border-transparent ' +
    'shadow-[0_10px_28px_-12px_rgba(255,138,42,0.65),inset_0_1px_0_rgba(255,255,255,0.5)] ' +
    'animate-[bet201-pulse-amber_1.6s_ease-in-out_infinite]',
  urgent:
    'bg-[linear-gradient(180deg,#ff7686,#e83448)] text-white border-transparent ' +
    'shadow-[0_10px_28px_-10px_rgba(255,90,108,0.7),inset_0_1px_0_rgba(255,255,255,0.35)] ' +
    'animate-[bet201-pulse-rose_1.1s_ease-in-out_infinite]',
  live:
    'bg-[rgba(33,217,122,0.12)] text-[#21d97a] border-[rgba(33,217,122,0.35)]',
};

function PhaseIcon({ phase }: { phase: Phase }) {
  if (phase === 'live')
    return (
      <span className='relative inline-flex h-2 w-2 mr-1'>
        <span className='absolute inset-0 rounded-full bg-[#21d97a] animate-ping opacity-60' />
        <span className='relative inline-flex h-2 w-2 rounded-full bg-[#21d97a]' />
      </span>
    );
  if (phase === 'urgent') return <AlarmClock className='h-3.5 w-3.5' />;
  if (phase === 'hot') return <Flame className='h-3.5 w-3.5' />;
  if (phase === 'cold') return <Clock className='h-3.5 w-3.5' />;
  return <Radio className='h-3.5 w-3.5' />;
}

export function CountdownPill({
  targetDate,
  label,
  onLive = 'show-live',
  className = '',
}: CountdownPillProps) {
  const target = React.useMemo(
    () => (typeof targetDate === 'string' ? new Date(targetDate) : targetDate),
    [targetDate],
  );

  const [state, setState] = React.useState<CountdownState>(() => compute(target, onLive));

  React.useEffect(() => {
    setState(compute(target, onLive));
    const id = window.setInterval(() => {
      setState(compute(target, onLive));
    }, 1000);
    return () => window.clearInterval(id);
  }, [target, onLive]);

  if (state.phase === 'hidden') return null;

  const baseCls =
    'inline-flex items-center gap-1.5 rounded-full border ' +
    'px-3 py-1 text-[11px] font-display font-semibold uppercase tracking-[0.08em] ' +
    'whitespace-nowrap select-none';

  return (
    <>
      <span
        className={`${baseCls} ${PHASE_STYLES[state.phase]} ${className}`}
        role='status'
        aria-live={state.phase === 'urgent' || state.phase === 'live' ? 'polite' : 'off'}
      >
        <PhaseIcon phase={state.phase} />
        {label && state.phase === 'cold' ? (
          <>
            <span className='opacity-80 normal-case font-medium'>{label}</span>
            <span className='font-mono tabular-nums'>
              {state.text.replace('começa em ', '')}
            </span>
          </>
        ) : (
          <span className='font-mono tabular-nums'>{state.text}</span>
        )}
      </span>
      <style>{`
        @keyframes bet201-pulse-amber {
          0%, 100% { filter: brightness(1); transform: translateY(0); }
          50% { filter: brightness(1.12); transform: translateY(-0.5px); }
        }
        @keyframes bet201-pulse-rose {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.15); }
        }
      `}</style>
    </>
  );
}

export default CountdownPill;
