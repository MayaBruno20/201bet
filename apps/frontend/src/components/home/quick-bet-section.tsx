'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useRouter } from 'next/navigation';
import { getPublicApiUrl, getPublicWsUrl } from '@/lib/env-public';
import { getStoredUser } from '@/lib/auth';
import { QuickBetDuel, QuickBetPanel, QuickBetSide } from './quick-bet-panel';
import type { MarketSnapshot } from '@/types/market';

const apiUrl = getPublicApiUrl();
const wsUrl = getPublicWsUrl();

/**
 * QuickBetPanel da home — agora plugado direto no MESMO snapshot/WebSocket que
 * a página /apostas usa. Garantia: a cotação aqui = cotação lá, sempre.
 *
 * Fluxo:
 *   1) GET /market/snapshot → pega o duelo destacado atual + odds reais
 *   2) Inscreve no socket `market:update` → atualiza odds em tempo real
 *   3) Click em apostar → joga pro /apostas com query params pré-selecionados
 */
export function QuickBetSection({ className }: { className?: string }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [userLoggedIn, setUserLoggedIn] = useState(false);
  const duelIdRef = useRef<string | null>(null);

  useEffect(() => {
    setUserLoggedIn(!!getStoredUser());
  }, []);

  useEffect(() => {
    let alive = true;

    // Snapshot inicial (mesmo endpoint do /apostas)
    fetch(`${apiUrl}/market/snapshot`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? r.text() : ''))
      .then((text) => {
        if (!alive || !text.trim()) return;
        try {
          const snap = JSON.parse(text) as MarketSnapshot | null;
          if (snap) {
            duelIdRef.current = snap.duelId;
            setSnapshot(snap);
          }
        } catch {
          /* ignora json malformado */
        }
      })
      .catch(() => undefined);

    // WebSocket para odds ao vivo
    const socket: Socket = io(wsUrl, { transports: ['websocket'] });
    socket.on('market:update', (payload: MarketSnapshot) => {
      if (!alive) return;
      setSnapshot((prev) => {
        // Se ainda não temos um duelo destaque, adota o primeiro que vier
        if (!prev) {
          duelIdRef.current = payload.duelId;
          return payload;
        }
        // Só atualiza se for o duelo que está sendo exibido
        if (prev.duelId === payload.duelId) return payload;
        return prev;
      });
    });

    return () => {
      alive = false;
      socket.disconnect();
    };
  }, []);

  if (!snapshot) return null;

  const duel: QuickBetDuel = {
    id: snapshot.duelId,
    eventName: snapshot.eventName,
    leftDriver: {
      name: snapshot.duel.left.label,
      odd: snapshot.duel.left.odd,
      poolShare: snapshot.duel.left.poolShare,
    },
    rightDriver: {
      name: snapshot.duel.right.label,
      odd: snapshot.duel.right.odd,
      poolShare: snapshot.duel.right.poolShare,
    },
  };

  const handlePlaceBet = (side: QuickBetSide, stake: number) => {
    if (!userLoggedIn) {
      router.push('/login');
      return;
    }
    // Confirmação final acontece em /apostas (saldo, validações, WS de odds vivas).
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
