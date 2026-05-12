'use client';

import * as React from 'react';
import { Flag, Trophy, Zap, Flame, type LucideIcon } from 'lucide-react';

/**
 * 201bet · /apostas — ModalityTabs
 * 4-segment tab control: Passadas / Vencedor Geral / Reações / Queimadas.
 */

export type ModalityIconKey = 'flag' | 'trophy' | 'zap' | 'flame';

export interface ModalityTab {
  id: string;
  label: string;
  icon: ModalityIconKey;
  available: boolean;
  /** Optional small count badge */
  count?: number;
}

export interface ModalityTabsProps {
  tabs?: ModalityTab[];
  activeId?: string;
  onChange?: (id: string) => void;
  className?: string;
}

const ICON_MAP: Record<ModalityIconKey, LucideIcon> = {
  flag: Flag,
  trophy: Trophy,
  zap: Zap,
  flame: Flame,
};

const DEFAULT_TABS: ModalityTab[] = [
  { id: 'passadas',       label: 'Passadas',       icon: 'flag',   available: true,  count: 18 },
  { id: 'vencedor-geral', label: 'Vencedor Geral', icon: 'trophy', available: true,  count: 4 },
  { id: 'reacoes',        label: 'Reações',        icon: 'zap',    available: true,  count: 6 },
  { id: 'queimadas',      label: 'Queimadas',      icon: 'flame',  available: true,  count: 2 },
];

export function ModalityTabs({
  tabs = DEFAULT_TABS,
  activeId,
  onChange,
  className = '',
}: ModalityTabsProps) {
  const effectiveActiveId = activeId ?? tabs.find((t) => t.available)?.id ?? tabs[0]?.id;

  return (
    <div
      className={`
        relative rounded-2xl bg-[#0d1320] border border-white/10
        p-1.5 inline-flex w-full sm:w-auto
        overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
        ${className}
      `}
      role='tablist'
      aria-label='Modalidades'
    >
      {tabs.map((tab) => {
        const isActive = tab.id === effectiveActiveId;
        const Icon = ICON_MAP[tab.icon];
        const disabled = !tab.available;
        return (
          <button
            key={tab.id}
            type='button'
            role='tab'
            aria-selected={isActive}
            aria-disabled={disabled}
            disabled={disabled}
            onClick={() => !disabled && onChange?.(tab.id)}
            className={`
              group relative flex-1 sm:flex-initial sm:min-w-[124px]
              flex flex-col items-center justify-center gap-1
              h-[68px] px-4 rounded-xl
              transition-all duration-200 ease-out
              focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60
              ${isActive
                ? 'bg-white text-[#0a0d14] shadow-[0_8px_22px_-10px_rgba(255,255,255,0.4),inset_0_1px_0_rgba(0,0,0,0.04)]'
                : disabled
                  ? 'text-[#4a4f5d] opacity-50 cursor-not-allowed'
                  : 'text-[#b8bcc9] hover:bg-white/[0.05] hover:text-white'}
            `}
          >
            <Icon
              className={`
                h-5 w-5 transition-transform duration-200
                ${isActive ? 'scale-110' : 'group-hover:scale-105'}
              `}
              strokeWidth={2.2}
              aria-hidden
            />
            <div className='flex items-center gap-1.5'>
              <span className='font-display text-[12px] font-semibold tracking-tight'>
                {tab.label}
              </span>
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span
                  className={`
                    font-mono text-[10px] tabular-nums leading-none
                    rounded-full px-1.5 py-0.5
                    ${isActive
                      ? 'bg-[#0a0d14] text-white'
                      : 'bg-white/[0.06] text-[#767b8a] group-hover:text-[#b8bcc9]'}
                  `}
                >
                  {tab.count}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default ModalityTabs;
