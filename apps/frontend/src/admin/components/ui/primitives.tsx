'use client';

import * as React from 'react';
import { I } from './icons';

export const Sparkline: React.FC<{ data?: number[]; color?: string; height?: number }> = ({ data = [], color = 'var(--accent)', height = 36 }) => {
  const id = React.useId();
  if (!data.length) return null;
  const w = 120, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * (h - 4) - 2).toFixed(1)}`).join(' ');
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${id})`} points={area} />
      <polyline fill="none" stroke={color} strokeWidth="1.6" points={pts} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export const Donut: React.FC<{ data?: { value: number; color: string; name?: string }[]; size?: number; thickness?: number }> = ({ data = [], size = 160, thickness = 22 }) => {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${size/2} ${size/2}) rotate(-90)`}>
        <circle r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const dash = `${len} ${c - len}`;
          const node = <circle key={i} r={r} fill="none" stroke={d.color} strokeWidth={thickness} strokeDasharray={dash} strokeDashoffset={-offset} strokeLinecap="butt"/>;
          offset += len;
          return node;
        })}
      </g>
    </svg>
  );
};

export const Bars: React.FC<{ data?: Record<string, number | string>[]; keys?: string[]; colors?: string[]; height?: number }> = ({ data = [], keys = [], colors = [], height = 220 }) => {
  if (!data.length) return null;
  const w = 600, h = height, pad = { l: 28, r: 8, t: 10, b: 22 };
  const maxAll = Math.max(...data.flatMap((d) => keys.map((k) => Number(d[k] ?? 0)))) || 1;
  const groupW = (w - pad.l - pad.r) / data.length;
  const bw = (groupW - 8) / keys.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      {[0,0.25,0.5,0.75,1].map((t,i) => {
        const y = pad.t + (h - pad.t - pad.b) * (1 - t);
        return <line key={i} x1={pad.l} x2={w-pad.r} y1={y} y2={y} stroke="rgba(255,255,255,0.04)" />;
      })}
      {data.map((d, i) => (
        <g key={i} transform={`translate(${pad.l + i*groupW + 4} 0)`}>
          {keys.map((k, j) => {
            const v = Number(d[k] ?? 0);
            const bh = (v / maxAll) * (h - pad.t - pad.b);
            const x = j * bw;
            const y = h - pad.b - bh;
            return <rect key={k} x={x} y={y} width={bw - 4} height={bh} rx="4" fill={colors[j]} opacity="0.9" />;
          })}
          <text x={(groupW - 8) / 2} y={h - 6} fontSize="10" fill="var(--text-3)" textAnchor="middle">{String(d.m)}</text>
        </g>
      ))}
    </svg>
  );
};

const AreaChartInner: React.FC<{ data: Record<string, number | string>[]; keys: string[]; colors: string[]; height: number }> = ({ data, keys, colors, height }) => {
  const baseId = React.useId();
  const w = 720, h = height, pad = { l: 32, r: 8, t: 14, b: 24 };
  const maxAll = Math.max(...data.flatMap((d) => keys.map((k) => Number(d[k] ?? 0)))) || 1;
  const stepX = data.length > 1 ? (w - pad.l - pad.r) / (data.length - 1) : 0;
  const xAt = (i: number) => data.length > 1 ? pad.l + i * stepX : (w - pad.r + pad.l) / 2;
  const linePoints = (k: string) =>
    data.map((d, i) => `${xAt(i).toFixed(1)},${(pad.t + (1 - Number(d[k] ?? 0)/maxAll) * (h - pad.t - pad.b)).toFixed(1)}`).join(' ');
  const areaPoints = (k: string) => `${pad.l},${h - pad.b} ${linePoints(k)} ${w - pad.r},${h - pad.b}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
      <defs>
        {keys.map((k, i) => (
          <linearGradient id={`${baseId}-${i}`} key={k} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={colors[i]} stopOpacity="0.35" />
            <stop offset="100%" stopColor={colors[i]} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {[0,0.25,0.5,0.75,1].map((t,i) => {
        const y = pad.t + (h - pad.t - pad.b) * t;
        return <line key={i} x1={pad.l} x2={w-pad.r} y1={y} y2={y} stroke="rgba(255,255,255,0.04)" />;
      })}
      {keys.map((k, i) => <polygon key={k+'a'} points={areaPoints(k)} fill={`url(#${baseId}-${i})`} />)}
      {keys.map((k, i) => <polyline key={k+'l'} points={linePoints(k)} fill="none" stroke={colors[i]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />)}
      {data.map((d, i) => (
        <text key={i} x={xAt(i)} y={h - 6} fontSize="10" fill="var(--text-3)" textAnchor="middle">{String(d.m)}</text>
      ))}
    </svg>
  );
};

export const AreaChart: React.FC<{ data?: Record<string, number | string>[]; keys?: string[]; colors?: string[]; height?: number }> = ({ data = [], keys = [], colors = [], height = 240 }) => {
  if (!data.length) return null;
  return <AreaChartInner data={data} keys={keys} colors={colors} height={height} />;
};

export const Avatar: React.FC<{ initials?: string; size?: number; tone?: string }> = ({ initials = '??', size = 36, tone = 'amber' }) => {
  const map: Record<string, string> = {
    amber: 'linear-gradient(135deg, #ffc55a, #ff7a1a)',
    sky: 'linear-gradient(135deg, #60a5fa, #4cc4ff)',
    emerald: 'linear-gradient(135deg, #34d399, #21d97a)',
    violet: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
    rose: 'linear-gradient(135deg, #fb7185, #ff5a6c)',
    slate: 'linear-gradient(135deg, #475569, #334155)',
  };
  return (
    <div className="flex items-center justify-center font-semibold text-white shrink-0"
      style={{ width: size, height: size, borderRadius: size/2.4, fontSize: size*0.36, background: map[tone] || map.amber }}>
      {initials}
    </div>
  );
};

export const StatusChip: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { bg: string; fg: string; dot: boolean }> = {
    'AO VIVO': { bg: 'var(--rose-soft)', fg: '#ff7585', dot: true },
    'ATIVA': { bg: 'var(--emerald-soft)', fg: '#3ee093', dot: false },
    'Ativo': { bg: 'var(--emerald-soft)', fg: '#3ee093', dot: false },
    'AGENDADO': { bg: 'var(--sky-soft)', fg: '#7cd0ff', dot: false },
    'ENCERRADO': { bg: 'rgba(255,255,255,0.06)', fg: 'var(--text-3)', dot: false },
    'PAUSADA': { bg: 'rgba(255,255,255,0.06)', fg: 'var(--text-3)', dot: false },
    'Inativo': { bg: 'rgba(255,255,255,0.06)', fg: 'var(--text-3)', dot: false },
    'Pendente': { bg: 'var(--accent-soft)', fg: '#ffc36b', dot: false },
    'Ganhou': { bg: 'var(--emerald-soft)', fg: '#3ee093', dot: false },
    'Perdeu': { bg: 'var(--rose-soft)', fg: '#ff7585', dot: false },
    'Cancelada': { bg: 'rgba(255,255,255,0.06)', fg: 'var(--text-3)', dot: false },
  };
  const s = map[status] || { bg: 'rgba(255,255,255,0.06)', fg: 'var(--text-3)', dot: false };
  return (
    <span className="chip" style={{ background: s.bg, color: s.fg }}>
      {s.dot && <span className="pulse-dot" />} {status}
    </span>
  );
};

export const Money: React.FC<{ value: number | string }> = ({ value }) => {
  const v = typeof value === 'number' ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value;
  return <span className="font-mono tracking-tight">R$ {v}</span>;
};

export const Page: React.FC<{ eyebrow?: string; title: string; sub?: string; actions?: React.ReactNode; children: React.ReactNode }> = ({ eyebrow, title, sub, actions, children }) => (
  <div className="px-4 sm:px-6 lg:px-7 py-5 sm:py-6 max-w-[1480px] mx-auto">
    <div className="flex items-end justify-between gap-4 sm:gap-6 flex-wrap mb-5 sm:mb-7">
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] font-semibold tracking-[0.16em] text-[color:var(--text-3)] uppercase">{eyebrow}</div>}
        <h1 className="font-display text-[26px] sm:text-[34px] leading-[1.05] font-bold mt-1">{title}</h1>
        {sub && <p className="text-[color:var(--text-2)] text-sm mt-2 max-w-2xl">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
    {children}
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className = '', style }) => (
  <div className={`surface ${className}`} style={style}>{children}</div>
);

export const SectionTitle: React.FC<{ title: string; sub?: React.ReactNode; action?: React.ReactNode }> = ({ title, sub, action }) => (
  <div className="flex items-end justify-between gap-4 mb-3 flex-wrap">
    <div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {sub && <p className="text-xs text-[color:var(--text-3)] mt-0.5">{sub}</p>}
    </div>
    {action}
  </div>
);

export { I };
