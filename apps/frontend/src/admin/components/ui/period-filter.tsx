'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';

/**
 * Dropdown de período padronizado: Hoje / 7d / 30d / Total.
 * `value` em horas. Use `0` para "Total" (sem filtro temporal).
 */

export type PeriodHours = 24 | 168 | 720 | 0;

export const PERIOD_OPTIONS: Array<{ hours: PeriodHours; label: string; short: string }> = [
  { hours: 24, label: 'Hoje', short: 'Hoje' },
  { hours: 168, label: 'Últimos 7 dias', short: '7d' },
  { hours: 720, label: 'Últimos 30 dias', short: '30d' },
  { hours: 0, label: 'Total', short: 'Total' },
];

export function PeriodFilter({
  value,
  onChange,
  className = '',
}: {
  value: PeriodHours;
  onChange: (hours: PeriodHours) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const current = PERIOD_OPTIONS.find((o) => o.hours === value) ?? PERIOD_OPTIONS[0];

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" className="btn btn-ghost focusable" onClick={() => setOpen((v) => !v)}>
        <I.Calendar size={15}/> {current.label} <I.ChevronDown size={14}/>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 z-50 surface-elev p-1.5 min-w-[180px]" style={{ borderRadius: 12 }}>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.hours}
              type="button"
              className="w-full text-left px-3 py-2 rounded-[8px] text-[13px] flex items-center justify-between hover:bg-[color:var(--surface-2)]"
              onClick={() => { onChange(opt.hours); setOpen(false); }}
            >
              <span>{opt.label}</span>
              {opt.hours === value && <I.Check size={14} style={{ color: 'var(--accent)' }}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function filterByPeriod<T>(items: T[], hours: PeriodHours, dateField: (item: T) => string | Date): T[] {
  if (hours <= 0) return items;
  const since = Date.now() - hours * 3_600_000;
  return items.filter((item) => {
    const d = dateField(item);
    const ts = typeof d === 'string' ? new Date(d).getTime() : d.getTime();
    return Number.isFinite(ts) && ts >= since;
  });
}
