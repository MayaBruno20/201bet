'use client';

import { useState } from 'react';

// Áreas (DDDs) que têm escudo em /public/images/logoListas/
const AREAS_WITH_LOGO = new Set([
  11, 13, 14, 15, 16, 17, 18, 19,
  21,
  34,
  41, 42, 43, 44, 45, 47, 48, 49,
  51, 55,
  65, 66, 67,
]);

export function getListLogoUrl(areaCode: number): string | null {
  if (!AREAS_WITH_LOGO.has(areaCode)) return null;
  return encodeURI(
    `/images/logoListas/Logo - Área${areaCode}_Images/Logo - Área${areaCode}_ImgID1.png`,
  );
}

type Props = {
  areaCode: number;
  /** Tamanho aplicado via tailwind. Default: h-11 w-11 */
  className?: string;
  /** Tamanho da fonte do fallback (texto do DDD). Default: text-sm */
  fallbackTextClassName?: string;
};

export function ListLogo({
  areaCode,
  className = 'h-11 w-11',
  fallbackTextClassName = 'text-sm',
}: Props) {
  const url = getListLogoUrl(areaCode);
  const [errored, setErrored] = useState(false);

  if (url && !errored) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] ${className}`}
      >
        <img
          src={url}
          alt={`Escudo Área ${areaCode}`}
          className='h-full w-full object-contain p-1'
          onError={() => setErrored(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-blue-500/20 to-orange-500/20 font-bold tracking-tight ${className} ${fallbackTextClassName}`}
    >
      {areaCode}
    </span>
  );
}
