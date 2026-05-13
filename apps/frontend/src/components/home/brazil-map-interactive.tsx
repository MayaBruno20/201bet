'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Crown } from 'lucide-react';

/**
 * 201bet — BrazilMapInteractive
 * Stylized Brazil map: one amber dot per active DDD area-code, positioned geographically.
 * Inactive DDDs render as subtle grey dots. Hover surfaces a tooltip with list info.
 */

export interface BrazilList {
  areaCode: number;
  kingName: string | null;
  format: 'TOP_10' | 'TOP_20';
  rosterCount: number;
  active: boolean;
}

export interface BrazilMapInteractiveProps {
  lists?: BrazilList[];
  onSelect?: (areaCode: number) => void;
  className?: string;
  /** Max width of the map. CSS value (e.g. "640px"). Default 720px. */
  maxWidth?: string;
}

const DDD_POSITIONS: Record<number, { x: number; y: number; city: string }> = {
  11: { x: 64, y: 65, city: 'São Paulo' },
  12: { x: 67, y: 64, city: 'Vale do Paraíba' },
  13: { x: 63, y: 68, city: 'Santos' },
  14: { x: 60, y: 64, city: 'Bauru' },
  15: { x: 62, y: 65, city: 'Sorocaba' },
  16: { x: 58, y: 62, city: 'Ribeirão Preto' },
  17: { x: 55, y: 60, city: 'S.J. Rio Preto' },
  18: { x: 53, y: 63, city: 'Presidente Prudente' },
  19: { x: 60, y: 63, city: 'Campinas' },
  21: { x: 72, y: 65, city: 'Rio de Janeiro' },
  22: { x: 75, y: 63, city: 'Campos' },
  24: { x: 70, y: 64, city: 'Petrópolis' },
  27: { x: 78, y: 60, city: 'Vitória' },
  28: { x: 76, y: 61, city: 'Cachoeiro' },
  31: { x: 70, y: 58, city: 'Belo Horizonte' },
  32: { x: 71, y: 60, city: 'Juiz de Fora' },
  33: { x: 73, y: 56, city: 'Governador Valadares' },
  34: { x: 64, y: 56, city: 'Uberlândia' },
  35: { x: 67, y: 60, city: 'Poços de Caldas' },
  37: { x: 67, y: 58, city: 'Divinópolis' },
  38: { x: 67, y: 53, city: 'Montes Claros' },
  41: { x: 60, y: 72, city: 'Curitiba' },
  42: { x: 57, y: 72, city: 'Ponta Grossa' },
  43: { x: 54, y: 70, city: 'Londrina' },
  44: { x: 53, y: 67, city: 'Maringá' },
  45: { x: 49, y: 70, city: 'Cascavel' },
  46: { x: 51, y: 73, city: 'Pato Branco' },
  47: { x: 62, y: 75, city: 'Joinville' },
  48: { x: 60, y: 78, city: 'Florianópolis' },
  49: { x: 56, y: 77, city: 'Chapecó' },
  51: { x: 55, y: 84, city: 'Porto Alegre' },
  53: { x: 55, y: 87, city: 'Pelotas' },
  54: { x: 53, y: 82, city: 'Caxias do Sul' },
  55: { x: 50, y: 82, city: 'Santa Maria' },
  61: { x: 60, y: 50, city: 'Brasília' },
  62: { x: 56, y: 54, city: 'Goiânia' },
  63: { x: 56, y: 42, city: 'Palmas' },
  64: { x: 54, y: 56, city: 'Rio Verde' },
  65: { x: 43, y: 48, city: 'Cuiabá' },
  66: { x: 47, y: 46, city: 'Rondonópolis' },
  67: { x: 44, y: 60, city: 'Campo Grande' },
  68: { x: 14, y: 38, city: 'Rio Branco' },
  69: { x: 24, y: 38, city: 'Porto Velho' },
  71: { x: 78, y: 46, city: 'Salvador' },
  73: { x: 78, y: 50, city: 'Ilhéus' },
  74: { x: 73, y: 46, city: 'Juazeiro' },
  75: { x: 76, y: 46, city: 'Feira de Santana' },
  77: { x: 70, y: 48, city: 'Vitória da Conquista' },
  79: { x: 82, y: 44, city: 'Aracaju' },
  81: { x: 86, y: 36, city: 'Recife' },
  82: { x: 84, y: 40, city: 'Maceió' },
  83: { x: 87, y: 32, city: 'João Pessoa' },
  84: { x: 87, y: 28, city: 'Natal' },
  85: { x: 80, y: 24, city: 'Fortaleza' },
  86: { x: 71, y: 28, city: 'Teresina' },
  87: { x: 80, y: 36, city: 'Petrolina' },
  88: { x: 78, y: 28, city: 'Sobral' },
  89: { x: 71, y: 32, city: 'Picos' },
  91: { x: 54, y: 22, city: 'Belém' },
  92: { x: 32, y: 24, city: 'Manaus' },
  93: { x: 48, y: 26, city: 'Santarém' },
  94: { x: 51, y: 28, city: 'Marabá' },
  95: { x: 36, y: 10, city: 'Boa Vista' },
  96: { x: 56, y: 16, city: 'Macapá' },
  97: { x: 28, y: 26, city: 'Tefé' },
  98: { x: 64, y: 20, city: 'São Luís' },
  99: { x: 64, y: 26, city: 'Imperatriz' },
};

const DEFAULT_LISTS: BrazilList[] = [
  { areaCode: 11, kingName: 'Caio "Trovão" Marques', format: 'TOP_20', rosterCount: 20, active: true },
  { areaCode: 21, kingName: 'Lucas "Centopeia" Reis', format: 'TOP_10', rosterCount: 10, active: true },
  { areaCode: 31, kingName: 'Bruno "Fogo" Tavares', format: 'TOP_10', rosterCount: 10, active: true },
  { areaCode: 41, kingName: 'Pedro "Diesel" Lima', format: 'TOP_20', rosterCount: 20, active: true },
  { areaCode: 51, kingName: 'Marcos "Vento Sul" Borges', format: 'TOP_10', rosterCount: 10, active: true },
  { areaCode: 61, kingName: 'Diego "Cerrado" Pires', format: 'TOP_10', rosterCount: 10, active: true },
  { areaCode: 71, kingName: 'André "Baiano" Souza', format: 'TOP_20', rosterCount: 20, active: true },
  { areaCode: 81, kingName: null, format: 'TOP_10', rosterCount: 7, active: true },
  { areaCode: 85, kingName: 'Tiago "Caju" Alencar', format: 'TOP_10', rosterCount: 10, active: true },
  { areaCode: 91, kingName: null, format: 'TOP_10', rosterCount: 8, active: true },
  { areaCode: 62, kingName: 'Wesley "Goiás" Camargo', format: 'TOP_10', rosterCount: 10, active: true },
  { areaCode: 48, kingName: 'Felipe "Ilha" Cardoso', format: 'TOP_10', rosterCount: 10, active: true },
  { areaCode: 65, kingName: null, format: 'TOP_10', rosterCount: 0, active: false },
  { areaCode: 67, kingName: null, format: 'TOP_10', rosterCount: 0, active: false },
  { areaCode: 84, kingName: null, format: 'TOP_10', rosterCount: 0, active: false },
  { areaCode: 92, kingName: null, format: 'TOP_10', rosterCount: 0, active: false },
];

interface HoverState {
  list: BrazilList;
  x: number;
  y: number;
}

export function BrazilMapInteractive({
  lists = DEFAULT_LISTS,
  onSelect,
  className = '',
  maxWidth = '720px',
}: BrazilMapInteractiveProps) {
  const [hover, setHover] = React.useState<HoverState | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const sorted = React.useMemo(
    () => [...lists].sort((a, b) => Number(a.active) - Number(b.active)),
    [lists],
  );

  return (
    <div
      ref={containerRef}
      className={`relative mx-auto w-full ${className}`}
      style={{ maxWidth, aspectRatio: '1 / 1.06' }}
    >
      <svg
        viewBox='0 0 100 106'
        className='absolute inset-0 h-full w-full'
        role='img'
        aria-label='Mapa do Brasil com as Listas ativas por DDD'
      >
        <defs>
          <radialGradient id='bet201-map-fill' cx='50%' cy='40%' r='70%'>
            <stop offset='0%' stopColor='rgba(255,176,40,0.05)' />
            <stop offset='60%' stopColor='rgba(255,176,40,0.02)' />
            <stop offset='100%' stopColor='rgba(255,255,255,0)' />
          </radialGradient>
          <filter id='bet201-map-glow' x='-50%' y='-50%' width='200%' height='200%'>
            <feGaussianBlur stdDeviation='1.4' result='blur' />
            <feMerge>
              <feMergeNode in='blur' />
              <feMergeNode in='SourceGraphic' />
            </feMerge>
          </filter>
        </defs>

        <path
          d='M 36 6
             L 56 10
             L 60 18
             L 70 16
             L 78 22
             L 84 22
             L 90 28
             L 92 36
             L 88 42
             L 84 48
             L 82 56
             L 78 64
             L 70 70
             L 64 78
             L 58 86
             L 50 90
             L 46 84
             L 42 76
             L 38 68
             L 30 60
             L 22 52
             L 14 44
             L 10 36
             L 14 28
             L 22 22
             L 30 14 Z'
          fill='url(#bet201-map-fill)'
          stroke='rgba(255,255,255,0.06)'
          strokeWidth='0.3'
          strokeDasharray='0.8 0.6'
        />

        {sorted.map((list, idx) => {
          const pos = DDD_POSITIONS[list.areaCode];
          if (!pos) return null;
          const isHovered = hover?.list.areaCode === list.areaCode;
          return (
            <motion.g
              key={list.areaCode}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.05 + idx * 0.03,
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{ transformOrigin: `${pos.x}px ${pos.y}px`, cursor: list.active ? 'pointer' : 'default' }}
              onMouseEnter={() => list.active && setHover({ list, x: pos.x, y: pos.y })}
              onMouseLeave={() => setHover(null)}
              onClick={() => list.active && onSelect?.(list.areaCode)}
            >
              {list.active ? (
                <>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={isHovered ? 3.6 : 2.6}
                    fill='rgba(255,176,40,0.18)'
                    style={{ transition: 'r 0.2s ease-out' }}
                  />
                  <motion.circle
                    cx={pos.x}
                    cy={pos.y}
                    r={2.4}
                    fill='rgba(255,176,40,0)'
                    stroke='#ffb028'
                    strokeWidth='0.3'
                    animate={{
                      r: [2.4, 4.6],
                      opacity: [0.6, 0],
                    }}
                    transition={{
                      duration: 2.2,
                      repeat: Infinity,
                      ease: 'easeOut',
                      delay: (list.areaCode % 7) * 0.18,
                    }}
                  />
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={isHovered ? 1.6 : 1.2}
                    fill='#ffb028'
                    filter='url(#bet201-map-glow)'
                    style={{ transition: 'r 0.2s ease-out' }}
                  />
                  <text
                    x={pos.x}
                    y={pos.y - 2.6}
                    textAnchor='middle'
                    fontSize='1.6'
                    fill='#ffd887'
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontWeight: 600,
                      pointerEvents: 'none',
                    }}
                  >
                    {list.areaCode}
                  </text>
                </>
              ) : (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={0.7}
                  fill='rgba(255,255,255,0.18)'
                />
              )}
            </motion.g>
          );
        })}
      </svg>

      {hover && (
        <div
          className='pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)]
                     rounded-xl border border-white/10 bg-[#0b0e18]/95 backdrop-blur-md
                     px-3 py-2 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.85)]
                     min-w-[200px]'
          style={{
            left: `${hover.x}%`,
            top: `${(hover.y / 106) * 100}%`,
          }}
        >
          <div className='flex items-center justify-between gap-2 mb-1'>
            <div className='font-mono text-[12px] text-[#ffb028] font-semibold'>
              Lista {hover.list.areaCode}
            </div>
            <div className='rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[#b8bcc9]'>
              {hover.list.format.replace('_', ' ')}
            </div>
          </div>
          <div className='flex items-center gap-1.5 text-[12px] text-[#f1f3f8]'>
            <Crown className='h-3 w-3 text-[#ffb028]' />
            {hover.list.kingName ? (
              <span className='truncate'>Rei: {hover.list.kingName}</span>
            ) : (
              <span className='text-[#767b8a] italic'>Trono vago</span>
            )}
          </div>
          <div className='text-[11px] text-[#767b8a] mt-0.5'>
            {hover.list.rosterCount} pilotos no roster
          </div>
        </div>
      )}

      <div className='absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 flex items-center gap-4 text-[11px] text-[#767b8a]
                      rounded-full border border-white/10 bg-[#0b0e18]/80 backdrop-blur-md px-4 py-1.5'>
        <span className='flex items-center gap-1.5'>
          <span className='h-2 w-2 rounded-full bg-[#ffb028] shadow-[0_0_8px_rgba(255,176,40,0.7)]' />
          Lista ativa
        </span>
        <span className='flex items-center gap-1.5'>
          <span className='h-1.5 w-1.5 rounded-full bg-white/30' />
          Em breve
        </span>
      </div>
    </div>
  );
}

export default BrazilMapInteractive;
