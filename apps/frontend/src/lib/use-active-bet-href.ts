'use client';

import { useEffect, useState } from 'react';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

/**
 * Destino do CTA "Apostar agora": quando há um Armageddon ativo (IN_PROGRESS),
 * leva pro hub do Armageddon; senão, pra página de apostas normal.
 * Reusa o cache de sessão 'armaActive' que a navbar já grava (sem flicker).
 */
export function useActiveBetHref(): string {
  const [armaActive, setArmaActive] = useState(false);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem('armaActive');
      if (cached !== null) setArmaActive(cached === '1');
    } catch { /* ignore */ }

    fetch(`${apiUrl}/armageddon`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ status?: string }>) => {
        const active = Array.isArray(data) && data.some((e) => e?.status === 'IN_PROGRESS');
        setArmaActive(active);
        try { sessionStorage.setItem('armaActive', active ? '1' : '0'); } catch { /* ignore */ }
      })
      .catch(() => { /* silencioso */ });
  }, []);

  return armaActive ? '/armageddon' : '/apostas';
}
