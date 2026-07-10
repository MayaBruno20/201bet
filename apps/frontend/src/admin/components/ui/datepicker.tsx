'use client';

import * as React from 'react';
import { I } from './icons';

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAYS_PT = ['D','S','T','Q','Q','S','S'];

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (d: Date | null) => d ? `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}` : '';
export const fmtDateTime = (d: Date | null) => d ? `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '';

type Props = {
  value?: string;
  onChange: (iso: string) => void;
  withTime?: boolean;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
};

export const DatePicker: React.FC<Props> = ({ value, onChange, withTime = true, placeholder = 'Selecione data', disabled = false, compact = false }) => {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<Date>(() => value ? new Date(value) : new Date());
  const [selected, setSelected] = React.useState<Date | null>(() => value ? new Date(value) : null);
  const [hour, setHour] = React.useState<number>(() => selected ? selected.getHours() : 19);
  const [minute, setMinute] = React.useState<number>(() => selected ? selected.getMinutes() : 0);

  React.useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) { setSelected(d); setView(d); setHour(d.getHours()); setMinute(d.getMinutes()); }
    }
  }, [value]);

  const days = React.useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(view.getFullYear(), view.getMonth()+1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
    return cells;
  }, [view]);

  const today = new Date();
  const isSameDay = (a: Date | null, b: Date | null) => !!(a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate());

  const apply = () => {
    if (!selected) return;
    const d = new Date(selected);
    if (withTime) { d.setHours(hour); d.setMinutes(minute); }
    onChange(d.toISOString());
    setOpen(false);
  };
  const clear = () => { setSelected(null); onChange(''); setOpen(false); };
  const setQuick = (mins: number) => {
    const d = new Date(); d.setMinutes(d.getMinutes() + mins);
    setSelected(d); setView(d); setHour(d.getHours()); setMinute(d.getMinutes());
  };

  const display = value ? (withTime ? fmtDateTime(new Date(value)) : fmtDate(new Date(value))) : '';

  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="input flex items-center gap-2 text-left"
        style={{ paddingTop: compact ? 7 : 10, paddingBottom: compact ? 7 : 10, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
        <I.Calendar size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }}/>
        <span className="truncate" style={{ color: display ? 'var(--text)' : 'var(--text-4)', flex: 1 }}>{display || placeholder}</span>
        <I.ChevronDown size={13} style={{ color: 'var(--text-3)' }}/>
      </button>
      {open && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 2147483640, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div className="surface-elev max-w-full" style={{ width: 360, padding: 18 }}>
            <div className="flex items-center justify-between mb-3">
              <button className="btn-icon focusable" onClick={() => setView(new Date(view.getFullYear(), view.getMonth()-1, 1))}><I.ChevronLeft size={15}/></button>
              <div className="font-display text-[14.5px] font-bold">{MONTHS_PT[view.getMonth()]} {view.getFullYear()}</div>
              <button className="btn-icon focusable" onClick={() => setView(new Date(view.getFullYear(), view.getMonth()+1, 1))}><I.ChevronRight size={15}/></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS_PT.map((d, i) => <div key={i} className="text-center text-[10px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((d, i) => {
                if (!d) return <div key={i}/>;
                const isToday = isSameDay(d, today);
                const isSel = isSameDay(d, selected);
                return (
                  <button key={i} onClick={() => setSelected(d)} className="h-8 rounded-[8px] text-[12px] font-semibold"
                    style={{
                      background: isSel ? 'linear-gradient(180deg, var(--accent), var(--accent-2))' : (isToday ? 'var(--surface-2)' : 'transparent'),
                      color: isSel ? '#1a1106' : (isToday ? 'var(--accent)' : 'var(--text)'),
                      border: '1px solid ' + (isToday && !isSel ? 'var(--accent-ring)' : 'transparent'),
                    }}>{d.getDate()}</button>
                );
              })}
            </div>
            {withTime && (
              <div className="mt-4 surface-2 p-3 flex items-center gap-3" style={{ borderRadius: 12 }}>
                <I.Clock size={14} style={{ color: 'var(--text-3)' }}/>
                <div className="text-[11px] text-[color:var(--text-3)]">Horário</div>
                <div className="ml-auto flex items-center gap-1.5">
                  <input type="number" min={0} max={23} value={hour} onChange={(e) => setHour(Math.max(0, Math.min(23, +e.target.value || 0)))} className="input text-center font-mono" style={{ width: 50, padding: '6px 4px' }}/>
                  <span className="font-mono text-[color:var(--text-3)]">:</span>
                  <input type="number" min={0} max={59} value={minute} onChange={(e) => setMinute(Math.max(0, Math.min(59, +e.target.value || 0)))} className="input text-center font-mono" style={{ width: 50, padding: '6px 4px' }}/>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {[{ label: 'Agora', mins: 0 },{ label: '+15min', mins: 15 },{ label: '+1h', mins: 60 },{ label: '+1 dia', mins: 60*24 }].map((q) => (
                <button key={q.label} onClick={() => setQuick(q.mins)} className="chip" style={{ background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer' }}>{q.label}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button className="btn btn-ghost flex-1 justify-center" onClick={clear}>Limpar</button>
              <button className="btn btn-ghost flex-1 justify-center" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn btn-primary flex-1 justify-center" onClick={apply} disabled={!selected}><I.Check size={14}/> Aplicar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
