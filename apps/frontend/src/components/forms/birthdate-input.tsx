'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { daysInMonth, MIN_AGE } from '@/lib/birthdate';

const MONTHS: { value: number; label: string }[] = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

function pad2(n: number) {
  return n.toString().padStart(2, '0');
}

function buildIso(yStr: string, mStr: string, dStr: string): string {
  if (!yStr || !mStr || !dStr) return '';
  const yi = Number(yStr);
  const mi = Number(mStr);
  const di = Number(dStr);
  if (!Number.isFinite(yi) || !Number.isFinite(mi) || !Number.isFinite(di)) return '';
  if (mi < 1 || mi > 12 || di < 1) return '';
  const maxD = daysInMonth(yi, mi);
  const dClamped = Math.min(di, maxD);
  return `${yi}-${pad2(mi)}-${pad2(dClamped)}`;
}

const selectClass =
  'w-full min-w-0 appearance-none rounded-2xl border border-white/10 bg-white/5 py-3.5 pl-3 pr-8 text-sm text-white outline-none transition-all focus:border-white/20 focus:ring-4 focus:ring-white/5';

const labelClass = 'mb-1.5 block text-xs font-medium text-white/55';

type BirthdateInputProps = {
  id?: string;
  value: string;
  onChange: (isoYmd: string) => void;
  minAge?: number;
  className?: string;
};

/**
 * Dia / mês / ano em listas (sem calendário nativo em cima do botão).
 * Anos: (hoje − 120) … (hoje − minAge), para impedir &lt; 18 só pela lista.
 */
export function BirthdateInput({
  value,
  onChange,
  minAge = MIN_AGE,
  className = '',
  id = 'birthdate',
}: BirthdateInputProps) {
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!value) {
      setDay('');
      setMonth('');
      setYear('');
      return;
    }
    const [y, m, d] = value.split('-');
    if (y && m && d) {
      setYear(y);
      setMonth(String(Number(m)));
      setDay(String(Number(d)));
    }
  }, [value]);

  useEffect(() => {
    if (!year || !month) return;
    const cap = daysInMonth(Number(year), Number(month));
    if (day && Number(day) > cap) {
      setDay(String(cap));
    }
  }, [year, month, day]);

  useEffect(() => {
    const iso = buildIso(year, month, day);
    if (iso !== value) {
      onChangeRef.current(iso);
    }
  }, [year, month, day, value]);

  const { yearFrom, yearTo } = useMemo(() => {
    const cy = new Date().getFullYear();
    return { yearFrom: cy - 120, yearTo: cy - minAge };
  }, [minAge]);

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = yearTo; y >= yearFrom; y--) {
      out.push(y);
    }
    return out;
  }, [yearFrom, yearTo]);

  const maxDay = useMemo(() => {
    if (!year || !month) return 31;
    return daysInMonth(Number(year), Number(month));
  }, [year, month]);

  const dayOptions = useMemo(() => {
    const n = year && month ? maxDay : 31;
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [year, month, maxDay]);

  return (
    <div className={`pb-1 ${className}`}>
      <span className={labelClass} id={`${id}-label`}>
        Data de nascimento
      </span>
      <p className='mb-2.5 text-xs text-white/40'>
        Escolha dia, mês e ano. Apenas {minAge}+ anos (a lista de anos já respeita isso).
      </p>
      <div className='grid grid-cols-3 gap-2' role='group' aria-labelledby={`${id}-label`}>
        <div className='relative min-w-0'>
          <select
            id={`${id}-day`}
            className={selectClass}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            required
            aria-label='Dia'
          >
            <option value='' disabled>
              Dia
            </option>
            {dayOptions.map((i) => (
              <option key={i} value={String(i)} className='bg-zinc-900'>
                {i}
              </option>
            ))}
          </select>
          <span
            className='pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-white/30'
            aria-hidden
          >
            ▼
          </span>
        </div>
        <div className='relative min-w-0'>
          <select
            id={`${id}-month`}
            className={selectClass}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            required
            aria-label='Mês'
          >
            <option value='' disabled>
              Mês
            </option>
            {MONTHS.map((mo) => (
              <option key={mo.value} value={String(mo.value)} className='bg-zinc-900'>
                {mo.label}
              </option>
            ))}
          </select>
          <span
            className='pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-white/30'
            aria-hidden
          >
            ▼
          </span>
        </div>
        <div className='relative min-w-0'>
          <select
            id={`${id}-year`}
            className={selectClass}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            required
            aria-label='Ano'
          >
            <option value='' disabled>
              Ano
            </option>
            {years.map((y) => (
              <option key={y} value={String(y)} className='bg-zinc-900'>
                {y}
              </option>
            ))}
          </select>
          <span
            className='pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-white/30'
            aria-hidden
          >
            ▼
          </span>
        </div>
      </div>
    </div>
  );
}
