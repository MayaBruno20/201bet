/**
 * Ícones SVG customizados da marca Armageddon (201bet).
 *
 * Traço fino e consistente (currentColor, stroke 1.75, cantos arredondados) para
 * casar com o visual premium do site. Substituem emojis na página pública —
 * bandeira quadriculada (passadas), coroa (campeão), alvo (resorteio), chaves
 * (chaveamento) e troféu (vencedor).
 */

import * as React from 'react';

type IconProps = Omit<React.SVGProps<SVGSVGElement>, 'stroke'> & { size?: number; stroke?: number };

const Svg: React.FC<IconProps & { children: React.ReactNode }> = ({ children, size = 18, stroke = 1.75, ...rest }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}
  >
    {children}
  </svg>
);

/** Bandeira quadriculada de chegada — Passadas. */
export const CheckeredFlagIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M5 3v18" />
    <rect x="5" y="4" width="12" height="9" rx="0.5" />
    <g fill="currentColor" stroke="none" opacity="0.9">
      <rect x="5" y="4" width="3" height="3" />
      <rect x="11" y="4" width="3" height="3" />
      <rect x="8" y="7" width="3" height="3" />
      <rect x="14" y="7" width="3" height="3" />
      <rect x="5" y="10" width="3" height="3" />
      <rect x="11" y="10" width="3" height="3" />
    </g>
  </Svg>
);

/** Coroa — Campeão geral. */
export const CrownIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M3 7.5l3.4 3 3.3-5.2a1.5 1.5 0 0 1 2.6 0l3.3 5.2 3.4-3a1 1 0 0 1 1.6.95l-1.3 7.1a1 1 0 0 1-1 .82H5.7a1 1 0 0 1-1-.82L3.4 8.45A1 1 0 0 1 3 7.5Z" />
    <path d="M5 20h14" />
  </Svg>
);

/** Alvo — Classificados ao Resorteio (acerte quem avança). */
export const TargetIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
);

/** Chaves de torneio — Chaveamento. */
export const BracketIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M4 5h4a2 2 0 0 1 2 2v3" />
    <path d="M4 19h4a2 2 0 0 0 2-2v-3" />
    <path d="M10 12h4" />
    <path d="M14 8h3a2 2 0 0 1 2 2v0" />
    <path d="M14 16h3a2 2 0 0 0 2-2v0" />
    <path d="M19 10v4" />
  </Svg>
);

/** Troféu — vencedor. */
export const TrophyIcon: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z" />
    <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  </Svg>
);
