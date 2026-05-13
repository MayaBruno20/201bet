'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Crown } from 'lucide-react';
import { MainNav } from '@/components/site/main-nav';
import { apiFetch } from '@/lib/api-request';
import { getPublicApiUrl, getPublicWsUrl } from '@/lib/env-public';
import { BettingBoard, BoardStage, MarketSnapshot, MultiRunnerSnapshot } from '@/types/market';

import { EventSelector, type BetEvent } from '@/components/apostas/event-selector';
import { ModalityTabs, type ModalityTab } from '@/components/apostas/modality-tabs';
import { DuelCard, type DuelData, type DuelStatus, type DuelSide } from '@/components/apostas/duel-card';
import { MultiRunnerCard, type MultiRunnerMarket as MRCardMarket, type MultiRunnerMarketType } from '@/components/apostas/multi-runner-card';
import { BetSlipDrawer, type BetSlipItem } from '@/components/apostas/bet-slip-drawer';
import { MyBetsHistory, type BetHistoryItem, type BetHistoryStatus } from '@/components/apostas/my-bets-history';
import { BetResultModal, type BetResult } from '@/components/apostas/bet-result-modal';

const apiUrl = getPublicApiUrl();
const wsUrl = getPublicWsUrl();

type MeResponse = {
  id: string;
  name: string;
  email: string;
  wallet?: { balance: number | string; currency: string };
};

type MyBet = {
  id: string;
  stake: number;
  potentialWin: number;
  status: string;
  createdAt: string;
  items: Array<{
    id: string;
    oddAtPlacement: number;
    oddLabel: string;
    eventId: string;
    marketName: string;
    eventName: string;
    duelId: string | null;
    stageLabel: string;
    duelStatus: string | null;
  }>;
};

type Tab = 'passadas' | 'vencedor' | 'reacao' | 'queimada';

const MARKET_TYPE_MAP: Record<Exclude<Tab, 'passadas'>, MultiRunnerMarketType> = {
  vencedor: 'WINNER',
  reacao: 'BEST_REACTION',
  queimada: 'FALSE_START',
};

const TAB_DEFS: { id: Tab; label: string; icon: 'flag' | 'trophy' | 'zap' | 'flame' }[] = [
  { id: 'passadas', label: 'Passadas',       icon: 'flag' },
  { id: 'vencedor', label: 'Vencedor Geral', icon: 'trophy' },
  { id: 'reacao',   label: 'Reações',        icon: 'zap' },
  { id: 'queimada', label: 'Queimadas',      icon: 'flame' },
];

export default function ApostasPage() {
  const [board, setBoard] = useState<BettingBoard | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, MarketSnapshot>>({});
  const [multiRunnerSnapshots, setMultiRunnerSnapshots] = useState<Record<string, MultiRunnerSnapshot>>({});
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedDuelId, setSelectedDuelId] = useState<string>('');
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [selectedOddId, setSelectedOddId] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('passadas');
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'SETTLED' | 'CANCELED'>('OPEN');
  // Carrinho (bilhete acumulado): cada item é uma aposta a ser enviada
  type CartItem = { duelId: string; side: 'LEFT' | 'RIGHT'; stake: number };
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartSubmitting, setCartSubmitting] = useState(false);
  // Resultados da última submissão em lote — exibidos no BetResultModal
  const [cartResults, setCartResults] = useState<BetResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [myBets, setMyBets] = useState<MyBet[]>([]);
  const [minBet, setMinBet] = useState(10);

  useEffect(() => {
    void loadBoardAndDefaults();
    void loadSession();
    void loadMyBets();
    void loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const res = await fetch(`${apiUrl}/market/config`);
      if (!res.ok) return;
      const cfg = await res.json();
      if (typeof cfg?.minBetAmount === 'number' && cfg.minBetAmount > 0) {
        setMinBet(cfg.minBetAmount);
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    const socket: Socket = io(wsUrl, { transports: ['websocket'] });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('market:sync', selectedDuelId ? { duelId: selectedDuelId } : {});
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('market:update', (payload: MarketSnapshot) => {
      setSnapshots((prev) => ({ ...prev, [payload.duelId]: payload }));
    });

    socket.on('market:multi-runner:update', (payload: MultiRunnerSnapshot) => {
      setMultiRunnerSnapshots((prev) => ({ ...prev, [payload.marketId]: payload }));
    });

    socket.on('market:settled', (payload: { marketId: string; winnerLabel: string }) => {
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('wallet:refresh'));
      void loadMyBets();
      setMessage(`Mercado liquidado: vencedor ${payload.winnerLabel}`);
    });

    return () => { socket.disconnect(); };
  }, [selectedDuelId]);

  const selectedEvent = useMemo(() => board?.events.find((e) => e.id === selectedEventId) ?? null, [board, selectedEventId]);

  /** Mapeia o snapshot + matchup pra um DuelStatus do novo componente. */
  const classifyDuelStatus = (stage: BoardStage): DuelStatus => {
    if (stage.matchupStatus === 'CANCELED' || stage.status === 'CANCELED') return 'CANCELED';
    const snap = snapshots[stage.duelId];
    if (snap?.settlement) return 'SETTLED';
    if (stage.matchupStatus === 'COMPLETED' || stage.matchupStatus === 'INVALIDATED') return 'SETTLED';
    if (snap && (snap.locked || snap.status === 'BOOKING_CLOSED' || snap.status === 'FINISHED')) return 'CLOSED';
    return 'OPEN';
  };

  /** Reduz DuelStatus → 3 buckets do filtro (OPEN | SETTLED | CANCELED). CLOSED conta como OPEN visualmente. */
  const filterBucket = (s: DuelStatus): 'OPEN' | 'SETTLED' | 'CANCELED' =>
    s === 'CANCELED' ? 'CANCELED' : s === 'SETTLED' ? 'SETTLED' : 'OPEN';

  const statusCounts = useMemo(() => {
    if (!selectedEvent) return { OPEN: 0, SETTLED: 0, CANCELED: 0 };
    const c = { OPEN: 0, SETTLED: 0, CANCELED: 0 };
    for (const s of selectedEvent.stages) c[filterBucket(classifyDuelStatus(s))] += 1;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent, snapshots]);

  // Agrupa stages por roundNumber → categoria, já filtrando pelo statusFilter
  const roundsForEvent = useMemo(() => {
    if (!selectedEvent) return [] as Array<{ roundNumber: number; categories: Array<{ category: string | null; categoryLabel: string | null; stages: BoardStage[] }> }>;
    const filtered = selectedEvent.stages.filter((s) => filterBucket(classifyDuelStatus(s)) === statusFilter);
    const byRound = new Map<number, Map<string, BoardStage[]>>();
    for (const s of filtered) {
      if (!byRound.has(s.roundNumber)) byRound.set(s.roundNumber, new Map());
      const catKey = s.category ?? '__none__';
      const catMap = byRound.get(s.roundNumber)!;
      if (!catMap.has(catKey)) catMap.set(catKey, []);
      catMap.get(catKey)!.push(s);
    }
    return Array.from(byRound.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([roundNumber, catMap]) => ({
        roundNumber,
        categories: Array.from(catMap.entries())
          .sort((a, b) => {
            const la = a[1][0]?.categoryLabel ?? 'zzz';
            const lb = b[1][0]?.categoryLabel ?? 'zzz';
            return la.localeCompare(lb, 'pt-BR');
          })
          .map(([key, stages]) => ({
            category: key === '__none__' ? null : key,
            categoryLabel: stages[0]?.categoryLabel ?? null,
            stages,
          })),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent, snapshots, statusFilter]);

  const activeRound = useMemo(() => {
    if (!roundsForEvent.length) return null;
    const target = selectedRound ?? roundsForEvent[0].roundNumber;
    return roundsForEvent.find((r) => r.roundNumber === target) ?? roundsForEvent[0];
  }, [roundsForEvent, selectedRound]);

  // Multi-runner markets for the selected event, grouped by type
  const eventMultiRunnerMarkets = useMemo(() => {
    if (!selectedEventId) return [] as MultiRunnerSnapshot[];
    return Object.values(multiRunnerSnapshots).filter((mr) => mr.eventId === selectedEventId);
  }, [multiRunnerSnapshots, selectedEventId]);

  // Counts por tab (passadas = abertos, outras = nº de mercados disponíveis daquele tipo)
  const tabsForUI: ModalityTab[] = useMemo(() => {
    return TAB_DEFS.map((t) => {
      if (t.id === 'passadas') {
        return { id: t.id, label: t.label, icon: t.icon, available: true, count: statusCounts.OPEN };
      }
      const type = MARKET_TYPE_MAP[t.id];
      const mks = eventMultiRunnerMarkets.filter((mr) => mr.marketType === type);
      return { id: t.id, label: t.label, icon: t.icon, available: mks.length > 0, count: mks.length };
    });
  }, [eventMultiRunnerMarkets, statusCounts.OPEN]);

  const currentTabMarkets = useMemo(() => {
    if (activeTab === 'passadas') return [] as MultiRunnerSnapshot[];
    const type = MARKET_TYPE_MAP[activeTab];
    return eventMultiRunnerMarkets.filter((mr) => mr.marketType === type);
  }, [eventMultiRunnerMarkets, activeTab]);

  const currentMRSnapshot = selectedMarketId
    ? multiRunnerSnapshots[selectedMarketId]
    : currentTabMarkets[0] ?? null;

  // Auto-select first market when switching tabs
  useEffect(() => {
    if (activeTab !== 'passadas' && currentTabMarkets.length > 0) {
      setSelectedMarketId(currentTabMarkets[0].marketId);
      setSelectedOddId(null);
    }
  }, [activeTab, currentTabMarkets]);

  // Fall back to Passadas if the active tab disappears
  useEffect(() => {
    if (!tabsForUI.some((t) => t.id === activeTab && t.available)) {
      setActiveTab('passadas');
    }
  }, [tabsForUI, activeTab]);

  async function loadSession() {
    try {
      const response = await apiFetch(`${apiUrl}/auth/me`, { cache: 'no-store' });
      if (!response.ok) return;
      setMe((await response.json()) as MeResponse);
    } catch { /* ignore */ }
  }

  async function loadMyBets() {
    try {
      const response = await apiFetch(`${apiUrl}/auth/my-bets`, { cache: 'no-store' });
      if (!response.ok) return;
      setMyBets((await response.json()) as MyBet[]);
    } catch { /* ignore */ }
  }

  async function loadBoardAndDefaults() {
    setLoading(true);
    setMessage('');
    try {
      const [boardRes, snapshotRes, mrRes] = await Promise.all([
        fetch(`${apiUrl}/market/board`),
        fetch(`${apiUrl}/market/snapshot`),
        fetch(`${apiUrl}/market/multi-runner/snapshots`),
      ]);
      if (!boardRes.ok || !snapshotRes.ok) throw new Error('Não foi possível carregar os mercados');
      const boardData = (await boardRes.json()) as BettingBoard;
      const snapText = await snapshotRes.text();
      const firstSnapshot = snapText.trim() ? (JSON.parse(snapText) as MarketSnapshot | null) : null;
      setBoard(boardData);
      if (mrRes.ok) {
        const mrList = (await mrRes.json()) as MultiRunnerSnapshot[];
        setMultiRunnerSnapshots(Object.fromEntries(mrList.map((s) => [s.marketId, s])));
      }
      if (firstSnapshot) {
        setSnapshots({ [firstSnapshot.duelId]: firstSnapshot });
        setSelectedEventId(firstSnapshot.eventId);
        setSelectedDuelId(firstSnapshot.duelId);
      } else if (boardData.events.length > 0) {
        setSelectedEventId(boardData.events[0].id);
        setSelectedDuelId(boardData.events[0].currentDuelId ?? boardData.events[0].stages[0]?.duelId ?? '');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }

  // ── Carrinho de apostas (multi-bet) ──────────────────────────────
  function cartToggle(duelId: string, nextSide: 'LEFT' | 'RIGHT') {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.duelId === duelId);
      if (idx === -1) {
        return [...prev, { duelId, side: nextSide, stake: minBet }];
      }
      if (prev[idx].side === nextSide) {
        return prev.filter((_, i) => i !== idx);
      }
      const updated = [...prev];
      updated[idx] = { ...updated[idx], side: nextSide };
      return updated;
    });
  }

  function cartRemove(duelId: string) {
    setCart((prev) => prev.filter((c) => c.duelId !== duelId));
  }

  function cartUpdateStake(duelId: string, value: number) {
    // Clamp pra evitar números absurdos vindos do input (paste/scientific notation).
    // Limite alto suficiente pra qualquer aposta real, baixo o suficiente pra não quebrar layout.
    const safe = Math.min(99999, Math.max(0, Number.isFinite(value) ? value : 0));
    setCart((prev) => prev.map((c) => (c.duelId === duelId ? { ...c, stake: safe } : c)));
  }

  const cartIndexByDuel = useMemo(() => {
    const m = new Map<string, CartItem>();
    cart.forEach((c) => m.set(c.duelId, c));
    return m;
  }, [cart]);

  const cartTotalStake = cart.reduce((acc, c) => acc + (Number.isFinite(c.stake) ? c.stake : 0), 0);
  const cartTotalReturn = cart.reduce((acc, c) => {
    const snap = snapshots[c.duelId];
    const odd = (c.side === 'LEFT' ? snap?.duel.left.odd : snap?.duel.right.odd) ?? 0;
    return acc + (Number.isFinite(c.stake) ? c.stake : 0) * odd;
  }, 0);
  const currentBalance = Number(me?.wallet?.balance ?? 0);

  // ── Mapeamento de carrinho → BetSlipItem para o drawer ─────────────
  const slipItems: BetSlipItem[] = useMemo(() => {
    return cart.map((c) => {
      const snap = snapshots[c.duelId];
      const sideData = c.side === 'LEFT' ? snap?.duel.left : snap?.duel.right;
      const oppData = c.side === 'LEFT' ? snap?.duel.right : snap?.duel.left;
      return {
        duelId: c.duelId,
        side: c.side,
        label: sideData?.label ?? 'Aguardando...',
        oppLabel: oppData?.label ?? 'Aguardando...',
        odd: sideData?.odd ?? 0,
        stake: c.stake,
      };
    });
  }, [cart, snapshots]);

  async function submitCart() {
    if (!cart.length || cartSubmitting) return;
    if (!me) { setMessage('Faça login para apostar.'); return; }
    if (cartTotalStake > currentBalance) {
      setMessage('Saldo insuficiente para o bilhete inteiro.');
      return;
    }
    const invalids = cart.filter((c) => !c.stake || c.stake < minBet);
    if (invalids.length) {
      setMessage(`Existem ${invalids.length} aposta(s) abaixo do mínimo de R$ ${minBet}.`);
      return;
    }

    setCartSubmitting(true);
    setMessage('');
    const results: BetResult[] = [];
    for (const item of cart) {
      const snap = snapshots[item.duelId];
      const sideData = item.side === 'LEFT' ? snap?.duel.left : snap?.duel.right;
      const label = sideData?.label ?? '—';
      try {
        const response = await apiFetch(`${apiUrl}/market/bet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duelId: item.duelId, side: item.side, amount: item.stake }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null as unknown);
          results.push({ duelId: item.duelId, side: item.side, label, ok: false, message: parseApiError(data) ?? `Erro ${response.status}` });
          continue;
        }
        const data = (await response.json()) as { snapshot: MarketSnapshot; bet: { id: string; potentialWin: number }; wallet: { balance: number } };
        setSnapshots((prev) => ({ ...prev, [data.snapshot.duelId]: data.snapshot }));
        setMe((prev) => (prev ? { ...prev, wallet: { balance: data.wallet.balance, currency: prev.wallet?.currency ?? 'BRL' } } : prev));
        results.push({ duelId: item.duelId, side: item.side, label, ok: true, message: 'Aposta confirmada', potentialWin: data.bet.potentialWin });
      } catch (err) {
        results.push({ duelId: item.duelId, side: item.side, label, ok: false, message: err instanceof Error ? err.message : 'Falha de rede' });
      }
    }

    if (typeof window !== 'undefined') window.dispatchEvent(new Event('wallet:refresh'));
    void loadMyBets();

    // Remove do carrinho só os que deram certo; mantém os que falharam
    const failedDuelIds = new Set(results.filter((r) => !r.ok).map((r) => r.duelId));
    setCart((prev) => prev.filter((c) => failedDuelIds.has(c.duelId)));

    setCartResults(results);
    setCartSubmitting(false);
  }

  async function placeMultiRunnerBet(oddId: string, stake: number) {
    const mrId = currentMRSnapshot?.marketId;
    if (!mrId) return;
    if (!me) { setMessage('Faça login para apostar.'); return; }
    setMessage('');
    try {
      const response = await apiFetch(`${apiUrl}/market/multi-runner/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketId: mrId, oddId, amount: stake }),
      });
      if (response.status === 401) { setMessage('Faça login para apostar.'); return; }
      if (!response.ok) {
        const data = await response.json().catch(() => null as unknown);
        throw new Error(parseApiError(data) ?? 'Não foi possível confirmar sua aposta');
      }
      const data = (await response.json()) as { snapshot: MultiRunnerSnapshot; bet: { id: string; oddAtPlacement: number; potentialWin: number }; wallet: { balance: number } };
      setMultiRunnerSnapshots((prev) => ({ ...prev, [data.snapshot.marketId]: data.snapshot }));
      setMe((prev) => (prev ? { ...prev, wallet: { balance: data.wallet.balance, currency: prev.wallet?.currency ?? 'BRL' } } : prev));
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('wallet:refresh'));
      void loadMyBets();
      setMessage(`Aposta confirmada! Ticket ${data.bet.id.slice(0, 8)} • odd ${data.bet.oddAtPlacement.toFixed(2)} • retorno R$ ${data.bet.potentialWin.toFixed(2)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao enviar aposta');
    }
  }

  // ── BetEvent[] derivado do board ──────────────────────────────────
  const eventsForSelector: BetEvent[] = useMemo(() => {
    if (!board) return [];
    return board.events.map((e) => ({
      id: e.id,
      name: e.name,
      startAt: e.startAt,
      status: (e.status === 'LIVE'
        ? 'LIVE'
        : e.status === 'FINISHED' || e.status === 'CANCELED'
          ? 'FINISHED'
          : 'SCHEDULED') as BetEvent['status'],
    }));
  }, [board]);

  // ── DuelData[] derivado das stages do round ativo ───────────────────
  const groupedDuels = useMemo(() => {
    if (!activeRound) return [] as Array<{ category: string | null; categoryLabel: string | null; duels: Array<{ stage: BoardStage; duel: DuelData }> }>;
    return activeRound.categories.map((cat) => ({
      category: cat.category,
      categoryLabel: cat.categoryLabel,
      duels: cat.stages.map((stage) => {
        const snap = snapshots[stage.duelId];
        const duel: DuelData = {
          id: stage.duelId,
          status: classifyDuelStatus(stage),
          totalPool: snap?.totalPool ?? 0,
          isSuperFinal: !!stage.isSuperFinal,
          left:  { label: snap?.duel.left.label  ?? 'Aguardando...', odd: snap?.duel.left.odd  ?? 1.9, photoUrl: snap?.duel.left.photoUrl  ?? null },
          right: { label: snap?.duel.right.label ?? 'Aguardando...', odd: snap?.duel.right.odd ?? 1.9, photoUrl: snap?.duel.right.photoUrl ?? null },
          settlement: snap?.settlement ? { winnerSide: snap.settlement.winnerSide } : undefined,
          isInitialOdds: !!snap && snap.totalPool === 0,
        };
        return { stage, duel };
      }),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRound, snapshots]);

  // ── MultiRunnerMarket pro card visual ────────────────────────────────
  const mrCardMarket: MRCardMarket | null = useMemo(() => {
    if (!currentMRSnapshot) return null;
    return {
      id: currentMRSnapshot.marketId,
      marketName: currentMRSnapshot.marketName,
      marketType: currentMRSnapshot.marketType,
      totalPool: currentMRSnapshot.totalPool,
      status: currentMRSnapshot.status,
      closeInSeconds: currentMRSnapshot.closeInSeconds,
      runners: currentMRSnapshot.runners.map((r) => ({
        oddId: r.oddId,
        label: r.label,
        odd: r.odd,
        pool: r.pool,
        // Backend retorna 0-100 (%), o componente espera 0-1 (fração).
        poolShare: Math.min(1, Math.max(0, r.poolShare / 100)),
        tickets: r.tickets,
      })),
    };
  }, [currentMRSnapshot]);

  // ── Histórico para o MyBetsHistory ───────────────────────────────────
  const historyItems: BetHistoryItem[] = useMemo(() => {
    return myBets.map((b) => {
      const item = b.items[0];
      const status: BetHistoryStatus = b.status === 'WON' ? 'WON'
        : b.status === 'LOST' ? 'LOST'
        : b.status === 'CANCELED' || b.status === 'REFUNDED' ? 'CANCELED'
        : 'OPEN';
      return {
        id: b.id,
        status,
        stake: Number(b.stake),
        potentialWin: Number(b.potentialWin),
        oddAtPlacement: item?.oddAtPlacement ?? 0,
        eventName: item?.eventName ?? 'Evento',
        marketName: item?.marketName ?? '—',
        oddLabel: item?.oddLabel ?? '—',
        createdAt: b.createdAt,
      };
    });
  }, [myBets]);

  return (
    <main className='min-h-screen bg-[#090b11] text-[#f1f3f8]'>
      <div className='mx-auto max-w-7xl px-3 pt-4 sm:px-6 sm:pt-6 lg:px-8'>
        <MainNav />

        {/* Header */}
        <section className='mt-2 rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-6'>
          <h1 className='font-display text-2xl sm:text-3xl font-bold tracking-tight'>Apostar em tempo real</h1>
          <p className='mt-1 text-xs sm:text-sm text-[#767b8a]'>Escolha o evento, o piloto e mande o bilhete.</p>
        </section>

        {message && <p className='mt-4 rounded-lg border border-white/20 bg-white/5 p-3 text-sm'>{message}</p>}

        {loading ? (
          <p className='mt-6 text-[#b8bcc9]'>Carregando mercados...</p>
        ) : (
          <>
            {/* Event selector */}
            <div className='mt-5'>
              <EventSelector
                events={eventsForSelector}
                selectedId={selectedEventId}
                onSelect={(id) => {
                  setSelectedEventId(id);
                  const ev = board?.events.find((e) => e.id === id);
                  setSelectedDuelId(ev?.currentDuelId ?? ev?.stages[0]?.duelId ?? '');
                  setSelectedRound(null);
                  setSelectedMarketId('');
                  setSelectedOddId(null);
                  setActiveTab('passadas');
                }}
              />
            </div>

            {/* Modality tabs — só aparece se há mais de uma modalidade com mercado aberto */}
            {tabsForUI.filter((t) => t.available).length > 1 && (
              <div className='mt-5'>
                <ModalityTabs tabs={tabsForUI} activeId={activeTab} onChange={(id) => setActiveTab(id as Tab)} />
              </div>
            )}

            {/* ── TAB: PASSADAS ── */}
            {activeTab === 'passadas' && (
              <div className='mt-6 space-y-6'>
                {/* Aviso pari-mutuel */}
                <div className='flex items-start gap-3 rounded-2xl border border-[rgba(255,176,40,0.25)] bg-[rgba(255,176,40,0.05)] px-4 py-3'>
                  <svg className='h-5 w-5 text-[#ffb028] shrink-0 mt-0.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                    <path strokeLinecap='round' strokeLinejoin='round' d='M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
                  </svg>
                  <p className='text-xs sm:text-sm text-[#ffd887] leading-relaxed'>
                    <strong className='font-semibold text-[#ffb028]'>Como o mercado funciona?</strong>{' '}
                    A cotação é dinâmica e o retorno final depende do rateio do pote no fechamento das apostas. O número exibido é uma estimativa e pode variar até o fim do bilhete. <strong className='text-[#ffb028]'>Quem acerta nunca recebe menos que o valor apostado.</strong>
                  </p>
                </div>

                {/* Status + Round row */}
                <div className='flex flex-wrap items-center gap-3 justify-between'>
                  <StatusFilterChips active={statusFilter} onChange={setStatusFilter} counts={statusCounts} />
                  {roundsForEvent.length > 1 && (
                    <RoundSelector
                      rounds={roundsForEvent.map((r) => ({
                        id: String(r.roundNumber),
                        label: r.roundNumber === 99 || r.categories.some((c) => c.stages.some((s) => s.isSuperFinal)) ? 'Super Final' : `Rodada ${r.roundNumber}`,
                        special: r.roundNumber === 99 || r.categories.some((c) => c.stages.some((s) => s.isSuperFinal)),
                      }))}
                      activeId={String(activeRound?.roundNumber ?? '')}
                      onChange={(id) => setSelectedRound(Number(id))}
                    />
                  )}
                </div>

                {/* Categorias + DuelCards */}
                {groupedDuels.length > 0 ? (
                  <div className='space-y-8'>
                    {groupedDuels.map((group) => (
                      <section key={group.category ?? 'sem-categoria'}>
                        {group.categoryLabel && (
                          <div className='flex items-center gap-2 mb-3'>
                            <span className='h-px w-6 bg-[#ffb028]' />
                            <h2 className='text-[11px] uppercase tracking-[0.22em] text-[#ffb028] font-semibold'>
                              Categoria {group.categoryLabel}
                            </h2>
                            <span className='font-mono text-[11px] text-[#4a4f5d]'>· {group.duels.length} embates</span>
                          </div>
                        )}
                        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
                          {group.duels.map(({ stage, duel }) => {
                            const cartEntry = cartIndexByDuel.get(stage.duelId);
                            return (
                              <DuelCard
                                key={stage.duelId}
                                duel={duel}
                                selectedSide={cartEntry?.side ?? null}
                                stakeForEstimate={cartEntry?.stake ?? minBet}
                                onSelect={(side: DuelSide) => {
                                  setSelectedDuelId(stage.duelId);
                                  cartToggle(stage.duelId, side);
                                }}
                              />
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className='rounded-2xl border border-dashed border-white/10 p-12 text-center'>
                    <p className='text-sm text-[#767b8a]'>
                      {statusFilter === 'OPEN' && 'Nenhum embate aberto no momento.'}
                      {statusFilter === 'SETTLED' && 'Nenhum embate auditado nesta rodada.'}
                      {statusFilter === 'CANCELED' && 'Nenhum embate cancelado.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── TAB: VENCEDOR / REACAO / QUEIMADA ── */}
            {activeTab !== 'passadas' && (
              <div className='mt-6 space-y-4'>
                {currentTabMarkets.length > 1 && (
                  <div className='flex flex-wrap gap-2'>
                    {currentTabMarkets.map((mr) => (
                      <button
                        key={mr.marketId}
                        type='button'
                        className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${selectedMarketId === mr.marketId
                          ? 'bg-white text-[#0a0d14] font-semibold'
                          : 'bg-white/[0.04] border border-white/10 text-[#b8bcc9] hover:bg-white/[0.08] hover:text-white'}
                        `}
                        onClick={() => { setSelectedMarketId(mr.marketId); setSelectedOddId(null); }}
                      >
                        {mr.marketName}
                      </button>
                    ))}
                  </div>
                )}

                {mrCardMarket ? (
                  <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
                    <MultiRunnerCard
                      market={mrCardMarket}
                      selectedOddId={selectedOddId}
                      onPick={(oddId) => setSelectedOddId(oddId)}
                      onPlaceBet={(oddId, stake) => placeMultiRunnerBet(oddId, stake)}
                      userLoggedIn={!!me}
                      minBet={minBet}
                    />
                  </div>
                ) : (
                  <div className='rounded-2xl border border-dashed border-white/10 p-12 text-center'>
                    <p className='text-[#767b8a]'>Nenhum mercado de {TAB_DEFS.find((t) => t.id === activeTab)?.label} criado para este evento.</p>
                  </div>
                )}
              </div>
            )}

            {/* Histórico do usuário */}
            <div className='mt-12 pb-2'>
              <MyBetsHistory bets={historyItems} />
            </div>
          </>
        )}
      </div>

      {/* Bilhete sticky */}
      <BetSlipDrawer
        items={slipItems}
        totalStake={cartTotalStake}
        totalReturn={cartTotalReturn}
        balance={currentBalance}
        balanceAfter={currentBalance - cartTotalStake}
        minBet={minBet}
        submitting={cartSubmitting}
        userLoggedIn={!!me}
        onStakeChange={cartUpdateStake}
        onRemove={cartRemove}
        onClear={() => !cartSubmitting && setCart([])}
        onSubmit={submitCart}
      />

      {/* Spacer pro conteúdo não ficar atrás do drawer fixo */}
      {cart.length > 0 && <div className='h-40 sm:h-32' />}

      {/* Modal de resultado */}
      {cartResults && (
        <BetResultModal
          open
          results={cartResults}
          onClose={() => setCartResults(null)}
        />
      )}
    </main>
  );
}

// ── Inline helpers (StatusFilterChips + RoundSelector) ─────────────────

function StatusFilterChips({
  active,
  onChange,
  counts,
}: {
  active: 'OPEN' | 'SETTLED' | 'CANCELED';
  onChange: (v: 'OPEN' | 'SETTLED' | 'CANCELED') => void;
  counts: { OPEN: number; SETTLED: number; CANCELED: number };
}) {
  const items: { id: 'OPEN' | 'SETTLED' | 'CANCELED'; label: string; cls: string }[] = [
    { id: 'OPEN',     label: 'Em aberto',  cls: 'text-[#21d97a]' },
    { id: 'SETTLED',  label: 'Auditadas',  cls: 'text-[#b8bcc9]' },
    { id: 'CANCELED', label: 'Canceladas', cls: 'text-[#ff5a6c]' },
  ];
  return (
    <div className='flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
      {items.map((it) => {
        const on = active === it.id;
        return (
          <button
            key={it.id}
            type='button'
            onClick={() => onChange(it.id)}
            className={`
              inline-flex shrink-0 items-center gap-1.5 h-8 px-3 rounded-full text-[12px] transition-colors whitespace-nowrap
              ${on
                ? 'bg-white text-[#0a0d14] font-semibold'
                : `bg-white/[0.04] border border-white/10 ${it.cls} hover:bg-white/[0.08]`}
            `}
          >
            {it.label}
            <span className={`font-mono text-[10px] tabular-nums ${on ? 'text-[#767b8a]' : 'text-[#4a4f5d]'}`}>
              {counts[it.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function RoundSelector({
  rounds,
  activeId,
  onChange,
}: {
  rounds: Array<{ id: string; label: string; special: boolean }>;
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className='flex items-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
      {rounds.map((r) => {
        const on = activeId === r.id;
        if (r.special) {
          return (
            <button
              key={r.id}
              type='button'
              onClick={() => onChange(r.id)}
              className={`
                inline-flex shrink-0 items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-display font-semibold transition-all whitespace-nowrap
                ${on
                  ? 'text-[#1a1305] bg-[linear-gradient(180deg,#ffc55a,#ff8a2a)] shadow-[0_8px_22px_-10px_rgba(255,138,42,0.65)]'
                  : 'bg-[rgba(255,176,40,0.10)] border border-[rgba(255,176,40,0.25)] text-[#ffb028] hover:bg-[rgba(255,176,40,0.16)]'}
              `}
            >
              <Crown className='h-3 w-3' />
              {r.label}
            </button>
          );
        }
        return (
          <button
            key={r.id}
            type='button'
            onClick={() => onChange(r.id)}
            className={`
              inline-flex shrink-0 items-center h-8 px-3 rounded-full text-[12px] transition-colors whitespace-nowrap
              ${on
                ? 'bg-white text-[#0a0d14] font-semibold'
                : 'bg-white/[0.04] border border-white/10 text-[#b8bcc9] hover:bg-white/[0.08] hover:text-white'}
            `}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

function parseApiError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as { message?: string | string[] };
  if (Array.isArray(candidate.message) && candidate.message[0]) return candidate.message[0];
  if (typeof candidate.message === 'string') return candidate.message;
  return null;
}

