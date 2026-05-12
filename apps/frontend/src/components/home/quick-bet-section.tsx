'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPublicApiUrl } from '@/lib/env-public';
import { getStoredUser } from '@/lib/auth';
import { QuickBetDuel, QuickBetPanel, QuickBetSide } from './quick-bet-panel';

const apiUrl = getPublicApiUrl();

type ApiOdd = { id: string; label: string; value: number; status: string };
type ApiMarket = { id: string; name: string; status: string; odds: ApiOdd[] };
type ApiDuel = {
  id: string;
  status: string;
  left: { driverName: string };
  right: { driverName: string };
};
type ApiEvent = {
  id: string;
  name: string;
  status: string;
  markets: ApiMarket[];
  duels: ApiDuel[];
};

function pickFeaturedDuel(events: ApiEvent[]): QuickBetDuel | null {
  for (const ev of events) {
    if (ev.status === 'CANCELED' || ev.status === 'FINISHED') continue;
    const openMarket = ev.markets.find((m) => m.status === 'OPEN' && m.odds.length >= 2);
    const firstDuel = ev.duels[0];
    if (!openMarket || !firstDuel) continue;
    return {
      id: firstDuel.id,
      eventName: ev.name,
      leftDriver: {
        name: firstDuel.left.driverName,
        odd: Number(openMarket.odds[0]?.value ?? 1.9),
      },
      rightDriver: {
        name: firstDuel.right.driverName,
        odd: Number(openMarket.odds[1]?.value ?? 1.9),
      },
    };
  }
  return null;
}

/**
 * Wrapper de QuickBetPanel: busca o primeiro evento com mercado aberto e
 * usa como duel destacado. onPlaceBet redireciona pra /apostas — o cálculo
 * de odd e a confirmação final acontecem lá (com WebSocket de odds vivas).
 */
export function QuickBetSection({ className }: { className?: string }) {
  const router = useRouter();
  const [duel, setDuel] = useState<QuickBetDuel | null>(null);
  const [userLoggedIn, setUserLoggedIn] = useState(false);

  useEffect(() => {
    setUserLoggedIn(!!getStoredUser());
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`${apiUrl}/events`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ApiEvent[]) => {
        if (!alive || !Array.isArray(data)) return;
        setDuel(pickFeaturedDuel(data));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!duel) return null;

  const handlePlaceBet = (side: QuickBetSide, stake: number) => {
    if (!userLoggedIn) {
      router.push('/login');
      return;
    }
    // Não confirmamos aposta diretamente daqui — odds podem ter mudado e a
    // página /apostas tem a UX completa (saldo, confirmação, retorno detalhado).
    const params = new URLSearchParams({
      duel: duel.id,
      side,
      stake: String(stake),
    });
    router.push(`/apostas?${params.toString()}`);
  };

  return (
    <div className={className}>
      <QuickBetPanel duel={duel} onPlaceBet={handlePlaceBet} userLoggedIn={userLoggedIn} />
    </div>
  );
}
