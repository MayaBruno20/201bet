'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPublicApiUrl } from '@/lib/env-public';
import { BrazilList, BrazilMapInteractive } from './brazil-map-interactive';

const apiUrl = getPublicApiUrl();

type ApiList = {
  areaCode: number;
  name: string;
  format: 'TOP_10' | 'TOP_20';
  active: boolean;
  kingName: string | null;
  rosterCount: number;
};

/**
 * Seção de listas Brasil — mapa interativo + texto explicativo lateral.
 * Quando o usuário clica num DDD ativo, redireciona pra /listas#DDD.
 */
export function BrazilListsSection({ className }: { className?: string }) {
  const router = useRouter();
  const [lists, setLists] = useState<BrazilList[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${apiUrl}/brazil-lists`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ApiList[]) => {
        if (!alive || !Array.isArray(data)) return;
        const mapped: BrazilList[] = data.map((l) => ({
          areaCode: l.areaCode,
          kingName: l.kingName,
          format: l.format,
          rosterCount: l.rosterCount,
          active: l.active,
        }));
        setLists(mapped);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // /brazil-lists só retorna ativas, então adicionamos placeholders inativos
  // pra dar densidade ao mapa nas regiões sem lista ainda.
  const enriched = lists ? withPlaceholders(lists) : null;

  return (
    <section className={`relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 ${className ?? ''}`}>
      <div className='grid lg:grid-cols-[1fr_1.2fr] gap-10 items-center'>
        <div>
          <div className='text-[11px] uppercase tracking-[0.18em] text-[#ffb028] font-semibold mb-3'>
            Listas Brasil
          </div>
          <h2 className='font-display text-4xl sm:text-5xl font-bold tracking-tight leading-tight mb-4 text-white'>
            Cada DDD tem o seu <span className='text-[#ffb028]'>Rei</span>.
          </h2>
          <p className='text-white/70 leading-relaxed'>
            Cada região mantém um TOP 10 ou TOP 20 com seu próprio Rei. Clique em um ponto
            para ver o roster, os embates pendentes e o histórico do trono.
          </p>
        </div>
        {enriched && (
          <BrazilMapInteractive
            lists={enriched}
            onSelect={(code) => router.push(`/listas#${code}`)}
          />
        )}
      </div>
    </section>
  );
}

/**
 * Lista de DDDs comuns que não estão ativos ainda — exibidos como pontos
 * cinzentos sutis pra mostrar cobertura futura sem prometer nada.
 */
const FILLER_DDDS = [
  12, 13, 14, 15, 16, 17, 18, 19, 22, 24, 27, 28, 32, 33, 34, 35, 37, 38,
  42, 43, 44, 45, 46, 47, 49, 53, 54, 55, 63, 64, 65, 66, 67, 68, 69,
  73, 74, 75, 77, 79, 82, 83, 84, 86, 87, 88, 89, 92, 93, 94, 95, 96, 97, 98, 99,
];

function withPlaceholders(active: BrazilList[]): BrazilList[] {
  const activeCodes = new Set(active.map((l) => l.areaCode));
  const fillers: BrazilList[] = FILLER_DDDS
    .filter((code) => !activeCodes.has(code))
    .map((code) => ({
      areaCode: code,
      kingName: null,
      format: 'TOP_10' as const,
      rosterCount: 0,
      active: false,
    }));
  return [...active, ...fillers];
}
