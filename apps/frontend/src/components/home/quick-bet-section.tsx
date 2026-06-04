'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useRouter } from 'next/navigation';
import { getPublicApiUrl, getPublicWsUrl } from '@/lib/env-public';
import { getStoredUser } from '@/lib/auth';
import { QuickBetDuel, QuickBetPanel, QuickBetSide } from './quick-bet-panel';
import type { MarketSnapshot } from '@/types/market';

const apiUrl = getPublicApiUrl();
const wsUrl = getPublicWsUrl();

// Descarta snapshots que pararam de chegar no stream (≈3 ciclos de broadcast de 4s).
const FRESH_MS = 12_000;

/**
 * Embate "ao vivo agora" = aposta aberta (BOOKING_OPEN). O bookingCloseAt/countdown
 * NÃO é enforced neste sistema — o embate continua apostável depois de zerar, até o
 * admin fechar — então NÃO usamos closeInSeconds como gate (senão o card sumiria
 * assim que o countdown chegasse a 0, que é o caso da maioria dos embates).
 */
function isLive(s: MarketSnapshot): boolean {
  return s.status === 'BOOKING_OPEN' && !!s.duel?.left && !!s.duel?.right;
}

/**
 * QuickBetPanel da home — card "AO VIVO AGORA".
 *
 * O gateway transmite um `market:update` por embate a cada 4s (e na conexão), então
 * selecionamos AQUI, direto do stream, o melhor embate que está AO VIVO agora:
 *   1) personalizado em destaque (isCustom && isFeatured)
 *   2) qualquer ao vivo com pote (totalPool > 0)
 *   3) qualquer ao vivo
 * Sem nenhum ao vivo → não mostra nada. Trocar pro destaque, derrubar um que fechou
 * e preencher quando outro abre acontecem em ≤4s, sem polling.
 */
export function QuickBetSection({ className }: { className?: string }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [userLoggedIn, setUserLoggedIn] = useState(false);

  useEffect(() => {
    setUserLoggedIn(!!getStoredUser());
  }, []);

  useEffect(() => {
    let alive = true;
    // Último snapshot conhecido por embate + quando chegou (pra podar os que pararam
    // de ser transmitidos, ex.: embate cancelado some do broadcast).
    const known = new Map<string, { snap: MarketSnapshot; at: number }>();

    const pickBestLive = (): MarketSnapshot | null => {
      const now = Date.now();
      const live = [...known.values()]
        .filter((e) => now - e.at < FRESH_MS && isLive(e.snap))
        .map((e) => e.snap);
      if (!live.length) return null;
      return (
        live.find((s) => s.isCustom && s.isFeatured) ||
        live.find((s) => s.totalPool > 0) ||
        live[0]
      );
    };

    // setSnapshot com a MESMA referência quando nada muda → React faz bail-out (sem
    // re-render). Referência nova (odds atualizadas / troca de embate / null) re-renderiza.
    const recompute = () => {
      if (alive) setSnapshot(pickBestLive());
    };

    const ingest = (snap: MarketSnapshot | null) => {
      if (!alive || !snap?.duelId) return;
      known.set(snap.duelId, { snap, at: Date.now() });
      recompute();
    };

    // Primeira pintura rápida: o backend já devolve o melhor embate ao vivo (ou null).
    fetch(`${apiUrl}/market/snapshot`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => {
        const trimmed = text.trim();
        if (!trimmed || trimmed === 'null') return;
        try {
          ingest(JSON.parse(trimmed) as MarketSnapshot);
        } catch {
          /* ignora json malformado */
        }
      })
      .catch(() => undefined);

    // Stream ao vivo de TODOS os embates.
    const socket: Socket = io(wsUrl, { transports: ['websocket'] });
    socket.on('market:update', (payload: MarketSnapshot) => ingest(payload));

    // Reavalia mesmo se o WS ficar quieto: poda embates expirados / que sumiram.
    const sweep = setInterval(recompute, 4_000);

    return () => {
      alive = false;
      clearInterval(sweep);
      socket.disconnect();
    };
  }, []);

  if (!snapshot || !snapshot.duel?.left || !snapshot.duel?.right) return null;

  const duel: QuickBetDuel = {
    id: snapshot.duelId,
    eventName: snapshot.eventName,
    leftDriver: {
      name: snapshot.duel.left.label,
      odd: snapshot.duel.left.odd ?? 1.0,
      poolShare: snapshot.duel.left.poolShare ?? 50,
    },
    rightDriver: {
      name: snapshot.duel.right.label,
      odd: snapshot.duel.right.odd ?? 1.0,
      poolShare: snapshot.duel.right.poolShare ?? 50,
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
