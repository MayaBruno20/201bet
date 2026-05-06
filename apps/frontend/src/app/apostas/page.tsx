'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Flag, Trophy, Zap, Flame, type LucideIcon } from 'lucide-react';
import { MainNav } from '@/components/site/main-nav';
import { apiFetch } from '@/lib/api-request';
import { getPublicApiUrl, getPublicWsUrl } from '@/lib/env-public';
import { BettingBoard, BoardStage, MarketSnapshot, MultiRunnerSnapshot } from '@/types/market';
import { MultiRunnerMarket } from '@/components/multi-runner-market';

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

const TABS: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: 'passadas', label: 'Passadas', Icon: Flag },
  { id: 'vencedor', label: 'Vencedor Geral', Icon: Trophy },
  { id: 'reacao', label: 'Reações Baixas', Icon: Zap },
  { id: 'queimada', label: 'Queimadas', Icon: Flame },
];

const MARKET_TYPE_MAP: Record<Tab, string> = {
  passadas: 'DUEL',
  vencedor: 'WINNER',
  reacao: 'BEST_REACTION',
  queimada: 'FALSE_START',
};

export default function ApostasPage() {
  const [board, setBoard] = useState<BettingBoard | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, MarketSnapshot>>({});
  const [multiRunnerSnapshots, setMultiRunnerSnapshots] = useState<Record<string, MultiRunnerSnapshot>>({});
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedDuelId, setSelectedDuelId] = useState<string>('');
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('passadas');
  const [statusFilter, setStatusFilter] = useState<'aberto' | 'auditado' | 'cancelado'>('aberto');
  // Carrinho (bilhete acumulado): cada item é uma aposta a ser enviada
  type CartItem = { duelId: string; side: 'LEFT' | 'RIGHT'; stake: number };
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartSubmitting, setCartSubmitting] = useState(false);
  // Resultados da última submissão em lote — exibidos em modal
  const [cartResults, setCartResults] = useState<Array<{ duelId: string; side: 'LEFT' | 'RIGHT'; ok: boolean; message: string; betId?: string; potentialWin?: number }> | null>(null);
  const [stakeRaw, setStakeRaw] = useState('100');
  const stake = Number(stakeRaw) || 0;
  const [side, setSide] = useState<'LEFT' | 'RIGHT'>('LEFT');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [placingBet, setPlacingBet] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
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
      // Pode ter ganhado uma aposta — atualiza saldo e bets
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('wallet:refresh'));
      void loadMyBets();
      setMessage(`Mercado liquidado: vencedor ${payload.winnerLabel}`);
    });

    return () => { socket.disconnect(); };
  }, [selectedDuelId]);

  const selectedEvent = useMemo(() => board?.events.find((e) => e.id === selectedEventId) ?? null, [board, selectedEventId]);

  // Helper: classifica cada stage pelo filtro (aberto/auditado/cancelado).
  // Usamos o snapshot quando disponível; fallback no matchupStatus do board.
  const classifyStage = (stage: BoardStage): 'aberto' | 'auditado' | 'cancelado' => {
    if (stage.matchupStatus === 'CANCELED' || stage.status === 'CANCELED') return 'cancelado';
    const snap = snapshots[stage.duelId];
    if (snap?.settlement) return 'auditado';
    if (stage.matchupStatus === 'COMPLETED' || stage.matchupStatus === 'INVALIDATED') return 'auditado';
    return 'aberto';
  };

  // Contadores por status (para badges nas tabs)
  const statusCounts = useMemo(() => {
    if (!selectedEvent) return { aberto: 0, auditado: 0, cancelado: 0 };
    const c = { aberto: 0, auditado: 0, cancelado: 0 };
    for (const s of selectedEvent.stages) c[classifyStage(s)] += 1;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvent, snapshots]);

  // Agrupa stages por roundNumber → categoria, já filtrando pelo statusFilter
  const roundsForEvent = useMemo(() => {
    if (!selectedEvent) return [] as Array<{ roundNumber: number; categories: Array<{ category: string | null; categoryLabel: string | null; stages: BoardStage[] }> }>;
    const filtered = selectedEvent.stages.filter((s) => classifyStage(s) === statusFilter);
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

  const currentDuelId = selectedDuelId || selectedEvent?.currentDuelId || selectedEvent?.stages[0]?.duelId || '';
  const snapshot = currentDuelId ? snapshots[currentDuelId] : undefined;
  const selectedSide = side === 'LEFT' ? snapshot?.duel.left : snapshot?.duel.right;
  const expectedReturn = selectedSide ? stake * selectedSide.odd : 0;
  const currentBalance = Number(me?.wallet?.balance ?? 0);
  const balanceAfterBet = currentBalance - stake;
  const canBet = !!snapshot && !!me && stake >= minBet && currentBalance >= stake;

  // Multi-runner markets for the selected event, grouped by type
  const eventMultiRunnerMarkets = useMemo(() => {
    if (!selectedEventId) return [];
    return Object.values(multiRunnerSnapshots).filter((mr) => mr.eventId === selectedEventId);
  }, [multiRunnerSnapshots, selectedEventId]);

  const availableTabs = useMemo(() => {
    return TABS.filter((tab) => {
      if (tab.id === 'passadas') return true;
      const type = MARKET_TYPE_MAP[tab.id];
      return eventMultiRunnerMarkets.some((mr) => mr.marketType === type);
    });
  }, [eventMultiRunnerMarkets]);

  const currentTabMarkets = useMemo(() => {
    const type = MARKET_TYPE_MAP[activeTab];
    return eventMultiRunnerMarkets.filter((mr) => mr.marketType === type);
  }, [eventMultiRunnerMarkets, activeTab]);

  const currentMRSnapshot = selectedMarketId ? multiRunnerSnapshots[selectedMarketId] : currentTabMarkets[0] ?? null;

  // Auto-select first market when switching tabs
  useEffect(() => {
    if (activeTab !== 'passadas' && currentTabMarkets.length > 0) {
      setSelectedMarketId(currentTabMarkets[0].marketId);
    }
  }, [activeTab, currentTabMarkets]);

  // Fall back to Passadas if the active tab disappears (e.g. trocou de evento sem mercado)
  useEffect(() => {
    if (!availableTabs.some((t) => t.id === activeTab)) {
      setActiveTab('passadas');
    }
  }, [availableTabs, activeTab]);

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
      // Mesmo lado: remove. Lado diferente: troca para o novo lado mantendo stake.
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

  function cartUpdateStake(duelId: string, raw: string) {
    const value = Number(raw.replace(',', '.')) || 0;
    setCart((prev) => prev.map((c) => (c.duelId === duelId ? { ...c, stake: value } : c)));
  }

  const cartTotalStake = cart.reduce((acc, c) => acc + (Number.isFinite(c.stake) ? c.stake : 0), 0);
  const cartIndexByDuel = useMemo(() => {
    const m = new Map<string, CartItem>();
    cart.forEach((c) => m.set(c.duelId, c));
    return m;
  }, [cart]);

  async function submitCart() {
    if (!cart.length || cartSubmitting) return;
    if (!me) { setMessage('Faça login para apostar.'); return; }
    // Validações pré-envio
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
    const results: NonNullable<typeof cartResults> = [];
    for (const item of cart) {
      try {
        const response = await apiFetch(`${apiUrl}/market/bet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duelId: item.duelId, side: item.side, amount: item.stake }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => null as unknown);
          results.push({ duelId: item.duelId, side: item.side, ok: false, message: parseApiError(data) ?? `Erro ${response.status}` });
          continue;
        }
        const data = (await response.json()) as { snapshot: MarketSnapshot; bet: { id: string; potentialWin: number }; wallet: { balance: number } };
        setSnapshots((prev) => ({ ...prev, [data.snapshot.duelId]: data.snapshot }));
        setMe((prev) => (prev ? { ...prev, wallet: { balance: data.wallet.balance, currency: prev.wallet?.currency ?? 'BRL' } } : prev));
        results.push({ duelId: item.duelId, side: item.side, ok: true, message: 'OK', betId: data.bet.id, potentialWin: data.bet.potentialWin });
      } catch (err) {
        results.push({ duelId: item.duelId, side: item.side, ok: false, message: err instanceof Error ? err.message : 'Falha de rede' });
      }
    }

    if (typeof window !== 'undefined') window.dispatchEvent(new Event('wallet:refresh'));
    void loadMyBets();

    // Remove do carrinho só os que deram certo; mantém os que falharam para o usuário corrigir
    const failedDuelIds = new Set(results.filter((r) => !r.ok).map((r) => r.duelId));
    setCart((prev) => prev.filter((c) => failedDuelIds.has(c.duelId)));

    setCartResults(results);
    setCartSubmitting(false);
  }

  async function placeBet() {
    if (!snapshot || !currentDuelId) return;
    setPlacingBet(true); setMessage('');
    try {
      const response = await apiFetch(`${apiUrl}/market/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duelId: currentDuelId, side, amount: stake }),
      });
      if (response.status === 401) { setMessage('Faça login para apostar.'); return; }
      if (!response.ok) {
        const data = await response.json().catch(() => null as unknown);
        throw new Error(parseApiError(data) ?? 'Não foi possível confirmar sua aposta');
      }
      const data = (await response.json()) as { snapshot: MarketSnapshot; bet: { id: string; oddAtPlacement: number; potentialWin: number }; wallet: { balance: number } };
      setSnapshots((prev) => ({ ...prev, [data.snapshot.duelId]: data.snapshot }));
      setMe((prev) => (prev ? { ...prev, wallet: { balance: data.wallet.balance, currency: prev.wallet?.currency ?? 'BRL' } } : prev));
      // notifica nav (e qualquer outro componente) para atualizar saldo
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('wallet:refresh'));
      void loadMyBets();
      setMessage(`Aposta confirmada! Ticket ${data.bet.id.slice(0, 8)} • odd ${data.bet.oddAtPlacement.toFixed(2)} • retorno R$ ${data.bet.potentialWin.toFixed(2)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao enviar aposta');
    } finally { setPlacingBet(false); }
  }

  async function placeMultiRunnerBet(oddId: string) {
    const mrId = currentMRSnapshot?.marketId;
    if (!mrId) return;
    setPlacingBet(true); setMessage('');
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
    } finally { setPlacingBet(false); }
  }

  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
        <MainNav />

        {/* Header */}
        <section className='mt-2 rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-6'>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='min-w-0'>
              <h1 className='text-xl font-semibold sm:text-2xl md:text-3xl'>Apostas em tempo real</h1>
              <p className='mt-1 text-xs sm:text-sm text-white/60'>Escolha o evento e a modalidade.</p>
            </div>
            <div className='flex items-center justify-between gap-3 sm:justify-end sm:gap-4'>
              {me && (
                <div className='text-left sm:text-right'>
                  <p className='text-[10px] text-white/40 uppercase tracking-wider'>Saldo</p>
                  <p className='text-base sm:text-lg font-bold text-emerald-400'>R$ {formatMoney(currentBalance)}</p>
                </div>
              )}
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-medium whitespace-nowrap ${connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                <span className={`mr-1.5 sm:mr-2 h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                {connected ? 'Ao vivo' : 'Reconectando'}
              </span>
            </div>
          </div>
        </section>

        {message && <p className='mt-4 rounded-lg border border-white/20 bg-white/5 p-3 text-sm'>{message}</p>}

        {loading ? (
          <p className='mt-6 text-white/70'>Carregando mercados...</p>
        ) : (
          <>
            {/* Event selector — scroll horizontal no mobile */}
            <div className='mt-4 -mx-3 sm:mx-0 overflow-x-auto px-3 sm:px-0 scrollbar-hide'>
              <div className='flex gap-2 min-w-fit'>
                {board?.events.map((event) => (
                  <button
                    key={event.id}
                    type='button'
                    className={`shrink-0 rounded-xl px-4 py-2.5 sm:px-5 sm:py-3 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${selectedEventId === event.id
                      ? 'bg-white text-[#090b11] shadow-lg'
                      : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/5'
                    }`}
                    onClick={() => {
                      setSelectedEventId(event.id);
                      setSelectedDuelId(event.currentDuelId ?? event.stages[0]?.duelId ?? '');
                      setSelectedRound(null);
                      setActiveTab('passadas');
                    }}
                  >
                    {event.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Tabs por modalidade — scroll horizontal no mobile */}
            <div className='mt-4 -mx-3 sm:mx-0 overflow-x-auto scrollbar-hide'>
              <div className='mx-3 sm:mx-0 flex gap-1 rounded-xl bg-[#101525] p-1 border border-white/10 min-w-fit'>
                {availableTabs.map((tab) => {
                  const { Icon } = tab;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type='button'
                      className={`group flex flex-1 sm:flex-1 flex-col items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-3 py-2.5 sm:px-4 sm:py-3 text-[11px] sm:text-sm font-semibold transition-all whitespace-nowrap min-w-[80px] ${active
                        ? 'bg-white text-[#090b11] shadow-lg'
                        : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                      }`}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <Icon
                        size={18}
                        strokeWidth={active ? 2.4 : 2}
                        className={`transition-transform ${active ? 'scale-110' : 'group-hover:scale-105'}`}
                      />
                      <span className='leading-none text-center'>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className='mt-6'>
              {/* ── TAB: PASSADAS (Duelos) ── */}
              {activeTab === 'passadas' && (
                <div className='space-y-4 sm:space-y-6'>
                  {/* Filtro de status (Em aberto / Auditadas / Canceladas) */}
                  <div className='flex gap-2 overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 scrollbar-hide'>
                    {([
                      { key: 'aberto', label: 'Em aberto', count: statusCounts.aberto, tone: 'bg-emerald-500 text-white shadow-lg' },
                      { key: 'auditado', label: 'Auditadas', count: statusCounts.auditado, tone: 'bg-blue-500 text-white shadow-lg' },
                      { key: 'cancelado', label: 'Canceladas', count: statusCounts.cancelado, tone: 'bg-red-500 text-white shadow-lg' },
                    ] as const).map((f) => {
                      const isActive = statusFilter === f.key;
                      return (
                        <button
                          key={f.key}
                          type='button'
                          onClick={() => { setStatusFilter(f.key); setSelectedRound(null); }}
                          className={`shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold transition-all ${
                            isActive ? f.tone : 'bg-white/5 text-white/60 hover:bg-white/10'
                          }`}
                        >
                          {f.label}
                          <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold ${
                            isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'
                          }`}>{f.count}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Round selector — uma aba por rodada (chave) com todas as categorias dentro */}
                  {roundsForEvent.length > 1 && (
                    <div className='-mx-3 sm:mx-0 overflow-x-auto px-3 sm:px-0 scrollbar-hide'>
                      <div className='flex gap-2 min-w-fit'>
                        {roundsForEvent.map((r) => {
                          const isActive = activeRound?.roundNumber === r.roundNumber;
                          const isSF = r.roundNumber === 99 || r.categories.some((c) => c.stages.some((s) => s.isSuperFinal));
                          const label = isSF ? 'Super Final' : `Rodada ${r.roundNumber}`;
                          return (
                            <button
                              key={r.roundNumber}
                              type='button'
                              className={`shrink-0 rounded-full px-4 py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${isActive
                                ? (isSF ? 'bg-amber-500 text-black shadow-lg' : 'bg-blue-500 text-white shadow-lg')
                                : 'bg-white/5 text-white/60 hover:bg-white/10'
                              }`}
                              onClick={() => setSelectedRound(r.roundNumber)}
                            >
                              {isSF && <span className='mr-1'>🏆</span>}{label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Lista de embates abertos da rodada — agrupado por categoria */}
                  {activeRound && (
                    <div className='space-y-4'>
                      {activeRound.categories.map((cat) => (
                        <section key={cat.category ?? 'none'} className='rounded-2xl border border-white/10 bg-[#0d1320] overflow-hidden'>
                          {cat.categoryLabel && (
                            <div className='flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 sm:px-4 sm:py-2.5'>
                              <p className='text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/60'>
                                Categoria <span className='text-white'>{cat.categoryLabel}</span>
                              </p>
                              <span className='text-[10px] text-white/40'>{cat.stages.length} embate{cat.stages.length !== 1 ? 's' : ''}</span>
                            </div>
                          )}
                          <ul className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-2 sm:p-3'>
                            {cat.stages.map((stage) => {
                              const snap = snapshots[stage.duelId];
                              const isActive = currentDuelId === stage.duelId;
                              const leftLabel = snap?.duel.left.label ?? 'Aguardando...';
                              const rightLabel = snap?.duel.right.label ?? 'Aguardando...';
                              const leftOdd = snap?.duel.left.odd;
                              const rightOdd = snap?.duel.right.odd;
                              const isCanceled = stage.matchupStatus === 'CANCELED' || stage.status === 'CANCELED';
                              const isClosed = !isCanceled && snap && (snap.locked || snap.status === 'BOOKING_CLOSED' || snap.status === 'FINISHED') && !snap.settlement;
                              const isSettled = !isCanceled && !!snap?.settlement;
                              const pillLabel = isCanceled ? 'CANCELADO' : isSettled ? 'AUDITADO' : isClosed ? 'FECHADO' : 'ABERTO';
                              const pillClass = isCanceled ? 'bg-red-500/15 text-red-300'
                                : isSettled ? 'bg-emerald-500/15 text-emerald-300'
                                : isClosed ? 'bg-amber-500/15 text-amber-300'
                                : 'bg-emerald-500/10 text-emerald-400';
                              const cartEntry = cartIndexByDuel.get(stage.duelId);
                              const cartLeft = cartEntry?.side === 'LEFT';
                              const cartRight = cartEntry?.side === 'RIGHT';
                              const canBetCard = !isCanceled && !isSettled && !isClosed;
                              return (
                                <li key={stage.duelId}>
                                  <div className={`h-full rounded-xl border p-3 transition-all ${
                                    cartEntry
                                      ? 'border-emerald-400 bg-emerald-500/[0.04] ring-2 ring-emerald-400/30'
                                      : isActive
                                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/40'
                                        : 'border-white/10 bg-white/[0.02]'
                                  }`}>
                                    <div className='flex items-center justify-between mb-2'>
                                      <button
                                        type='button'
                                        onClick={() => setSelectedDuelId(stage.duelId)}
                                        className='text-[9px] font-bold uppercase tracking-widest text-white/40 hover:text-white/70'
                                        title='Ver detalhes deste embate'
                                      >
                                        {stage.isSuperFinal ? '🏆 Super Final' : `Pote R$ ${snap ? formatMoney(snap.totalPool) : '0,00'}`}
                                      </button>
                                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider ${pillClass}`}>
                                        {pillLabel}
                                      </span>
                                    </div>
                                    <div className='space-y-1.5'>
                                      <button
                                        type='button'
                                        disabled={!canBetCard}
                                        onClick={() => canBetCard && cartToggle(stage.duelId, 'LEFT')}
                                        className={`w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-all ${
                                          cartLeft ? 'bg-blue-500/30 ring-1 ring-blue-400'
                                            : canBetCard ? 'hover:bg-white/5' : 'opacity-50 cursor-not-allowed'
                                        }`}
                                      >
                                        <p className='text-xs font-semibold truncate text-white/90 flex-1 min-w-0 text-left'>{cartLeft && <span className='mr-1'>✓</span>}{leftLabel}</p>
                                        <p className='text-sm font-bold text-blue-400 shrink-0'>@{leftOdd?.toFixed(2) ?? '--'}</p>
                                      </button>
                                      <div className='border-t border-white/5'></div>
                                      <button
                                        type='button'
                                        disabled={!canBetCard}
                                        onClick={() => canBetCard && cartToggle(stage.duelId, 'RIGHT')}
                                        className={`w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-all ${
                                          cartRight ? 'bg-orange-500/30 ring-1 ring-orange-400'
                                            : canBetCard ? 'hover:bg-white/5' : 'opacity-50 cursor-not-allowed'
                                        }`}
                                      >
                                        <p className='text-xs font-semibold truncate text-white/90 flex-1 min-w-0 text-left'>{cartRight && <span className='mr-1'>✓</span>}{rightLabel}</p>
                                        <p className='text-sm font-bold text-orange-400 shrink-0'>@{rightOdd?.toFixed(2) ?? '--'}</p>
                                      </button>
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ))}
                    </div>
                  )}

                  {snapshot ? (
                    <>
                      {/* Banner de Resultado Final (rodada auditada) */}
                      {snapshot.settlement && (
                        <div className='rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 p-4 sm:p-5'>
                          <div className='flex items-center gap-3 mb-3'>
                            <div className='shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-emerald-500/20 flex items-center justify-center'>
                              <svg className='w-6 h-6 sm:w-7 sm:h-7 text-emerald-400' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                                <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M5 13l4 4L19 7' />
                              </svg>
                            </div>
                            <div className='flex-1 min-w-0'>
                              <p className='text-[10px] font-bold uppercase tracking-widest text-emerald-300/70'>Rodada Auditada</p>
                              <p className='text-base sm:text-xl font-bold text-emerald-200 truncate'>Vencedor: {snapshot.settlement.winnerLabel}</p>
                            </div>
                          </div>
                          <div className='grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mt-3'>
                            <div className='rounded-lg bg-black/20 p-2.5 sm:p-3'>
                              <p className='text-[10px] uppercase tracking-widest text-white/40'>Pote Final</p>
                              <p className='mt-1 text-sm sm:text-lg font-bold text-white'>R$ {formatMoney(snapshot.settlement.finalPool)}</p>
                            </div>
                            <div className='rounded-lg bg-black/20 p-2.5 sm:p-3'>
                              <p className='text-[10px] uppercase tracking-widest text-white/40'>Odd Final</p>
                              <p className='mt-1 text-sm sm:text-lg font-bold text-emerald-300'>@{snapshot.settlement.finalOdd.toFixed(2)}</p>
                            </div>
                            <div className='col-span-2 sm:col-span-1 rounded-lg bg-black/20 p-2.5 sm:p-3'>
                              <p className='text-[10px] uppercase tracking-widest text-white/40'>Liquidado em</p>
                              <p className='mt-1 text-xs font-medium text-white/80'>{new Date(snapshot.settlement.settledAt).toLocaleString('pt-BR')}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Banner: apostas encerradas / pausadas (so se nao auditado) */}
                      {!snapshot.settlement && (snapshot.locked || snapshot.status === 'BOOKING_CLOSED' || snapshot.status === 'FINISHED') && (
                        <div className='rounded-2xl border-2 border-red-500/40 bg-gradient-to-r from-red-500/15 to-red-500/5 p-4 sm:p-5 flex items-center gap-3 sm:gap-4'>
                          <div className='shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-500/20 flex items-center justify-center'>
                            <svg className='w-6 h-6 sm:w-7 sm:h-7 text-red-400' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                              <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
                            </svg>
                          </div>
                          <div className='flex-1 min-w-0'>
                            <p className='font-bold text-red-300 text-base sm:text-lg'>Apostas encerradas</p>
                            <p className='text-xs sm:text-sm text-red-200/70 mt-0.5'>
                              {snapshot.lockMessage ?? (snapshot.status === 'FINISHED' ? 'Esta corrida ja foi finalizada e o resultado liquidado.' : 'O periodo de apostas para esta rodada foi encerrado.')}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Duel header — info do embate (sempre visível) */}
                      <div className='flex items-end justify-between border-b border-white/5 pb-3 sm:pb-4'>
                        <div className='min-w-0'>
                          <p className='text-[10px] font-semibold uppercase tracking-widest text-blue-400/70'>{snapshot.stageLabel}</p>
                          <h2 className='mt-1 text-lg sm:text-2xl font-semibold tracking-tight truncate'>{snapshot.eventName}</h2>
                          <p className='mt-1 text-[11px] sm:text-xs text-white/50 flex flex-wrap gap-x-2 gap-y-1'>
                            <span>Pote: <strong className='text-white/80'>R$ {formatMoney(snapshot.totalPool)}</strong></span>
                            {!snapshot.settlement && snapshot.closeInSeconds > 0 && (
                              <span className='text-amber-400'>
                                Encerra em: <strong>{formatCloseWindow(snapshot.closeInSeconds)}</strong>
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Bloco de seleção/aposta — escondido após auditoria */}
                      {!snapshot.settlement && (
                        <>
                          {/* Pool distribution bar */}
                          {snapshot.totalPool > 0 && (
                            <div className='flex h-2 rounded-full overflow-hidden gap-[2px]'>
                              <div className='bg-blue-500 transition-all duration-500' style={{ width: `${(snapshot.duel.left.pool / snapshot.totalPool * 100)}%` }} />
                              <div className='bg-orange-500 transition-all duration-500' style={{ width: `${(snapshot.duel.right.pool / snapshot.totalPool * 100)}%` }} />
                            </div>
                          )}

                          {/* Aviso pari-mutuel */}
                          <div className='flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5'>
                            <svg className='h-4 w-4 text-amber-400 shrink-0 mt-0.5' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                              <path strokeLinecap='round' strokeLinejoin='round' d='M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
                            </svg>
                            <p className='text-[11px] sm:text-xs text-amber-100/90 leading-relaxed'>
                              <strong className='font-semibold text-amber-200'>Mercado pari-mutuel:</strong> a cotação é dinâmica e o retorno final depende do rateio do pote no fechamento das apostas. O número exibido é uma estimativa e pode variar até o fim do bilhete. <strong>Quem acerta nunca recebe menos que o valor apostado.</strong>
                            </p>
                          </div>

                          {/* Odd cards — empilhados em mobile */}
                          <div className='grid gap-3 sm:gap-4 sm:grid-cols-2'>
                            <OddCard title={snapshot.duel.left.label} odd={snapshot.duel.left.odd} pool={snapshot.duel.left.pool} tickets={snapshot.duel.left.tickets} photoUrl={snapshot.duel.left.photoUrl} active={side === 'LEFT'} onClick={() => setSide('LEFT')} tone='blue' />
                            <OddCard title={snapshot.duel.right.label} odd={snapshot.duel.right.odd} pool={snapshot.duel.right.pool} tickets={snapshot.duel.right.tickets} photoUrl={snapshot.duel.right.photoUrl} active={side === 'RIGHT'} onClick={() => setSide('RIGHT')} tone='orange' />
                          </div>

                          {/* Bet form */}
                          <div className='rounded-2xl border border-white/8 bg-white/[0.02] p-4 sm:p-6'>
                            <div className='grid gap-4 sm:gap-6 lg:grid-cols-2'>
                              <div className='space-y-1 text-sm'>
                                <p className='text-white/40 text-xs sm:text-sm'>Sua seleção</p>
                                <p className='text-base sm:text-lg font-medium'>{selectedSide?.label ?? 'Nenhum'}</p>
                                <div className='h-2' />
                                <div className='flex justify-between border-b border-white/5 pb-2 text-white/60 text-xs sm:text-sm'>
                                  <span>Saldo</span>
                                  <span className='font-medium text-white'>R$ {formatMoney(currentBalance)}</span>
                                </div>
                                <div className='flex justify-between border-b border-white/5 py-2 text-white/60 text-xs sm:text-sm'>
                                  <span>Saldo após aposta</span>
                                  <span className={`font-medium ${balanceAfterBet < 0 ? 'text-red-400' : 'text-white'}`}>R$ {formatMoney(balanceAfterBet)}</span>
                                </div>
                                <div className='flex justify-between py-2 text-white/60 text-xs sm:text-sm'>
                                  <span>Retorno estimado <span className='text-white/30'>(varia)</span></span>
                                  <span className='font-semibold text-emerald-400'>~ R$ {formatMoney(expectedReturn)}</span>
                                </div>
                                {!me && <p className='mt-3 text-xs text-amber-400'>Faça login para apostar.</p>}
                                {stake < minBet && <p className='mt-1 text-xs text-amber-400'>Valor mínimo: R$ {minBet.toFixed(2).replace('.', ',')}.</p>}
                                {me && currentBalance < stake && <p className='mt-1 text-xs text-red-400'>Saldo insuficiente.</p>}
                              </div>
                              <div className='flex flex-col justify-end gap-3'>
                                <div className='relative'>
                                  <span className='absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-medium text-sm sm:text-base'>R$</span>
                                  <input className='w-full rounded-2xl border border-white/10 bg-[#090b11]/50 py-3 sm:py-4 pl-11 sm:pl-12 pr-4 text-xl sm:text-2xl font-semibold text-white focus:border-white/30 focus:outline-none' type='number' inputMode='decimal' min={minBet} step={5} value={stakeRaw} onChange={(e) => setStakeRaw(e.target.value)} />
                                </div>
                                <button type='button' className='w-full rounded-2xl bg-white px-4 py-3 sm:py-4 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all hover:bg-white/90 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none' disabled={!canBet || placingBet} onClick={() => setConfirmOpen(true)}>
                                  {placingBet ? 'Processando...' : 'Confirmar Bilhete ->'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                    </>
                  ) : (
                    <div className='rounded-2xl border border-dashed border-white/10 p-12 text-center'>
                      <p className='text-white/40'>Nenhum duelo disponível para este evento.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── TABS: Vencedor / Reação / Queimada (Multi-Runner) ── */}
              {activeTab !== 'passadas' && (
                <div className='space-y-6'>
                  {/* Market selector if multiple markets of this type */}
                  {currentTabMarkets.length > 1 && (
                    <div className='flex flex-wrap gap-2'>
                      {currentTabMarkets.map((mr) => (
                        <button
                          key={mr.marketId}
                          type='button'
                          className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${selectedMarketId === mr.marketId
                            ? 'bg-emerald-500 text-black shadow-lg'
                            : 'bg-white/5 text-white/60 hover:bg-white/10'
                          }`}
                          onClick={() => setSelectedMarketId(mr.marketId)}
                        >
                          {mr.marketName}
                        </button>
                      ))}
                    </div>
                  )}

                  {currentMRSnapshot ? (
                    <MultiRunnerMarket
                      snapshot={currentMRSnapshot}
                      me={me}
                      stake={stake}
                      setStake={(value) => setStakeRaw(String(value))}
                      onPlaceBet={placeMultiRunnerBet}
                      placingBet={placingBet}
                    />
                  ) : (
                    <div className='rounded-2xl border border-dashed border-white/10 p-12 text-center'>
                      <p className='text-white/40'>Nenhum mercado de {TABS.find((t) => t.id === activeTab)?.label} criado para este evento.</p>
                      <p className='mt-1 text-xs text-white/25'>Crie um mercado no painel admin para começar.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Meus Bilhetes ── */}
              <div className='mt-10 pt-8 border-t border-white/8'>
                <p className='text-lg font-semibold tracking-tight mb-4'>Meus Bilhetes</p>
                <div className='max-h-96 space-y-3 overflow-auto pr-2'>
                  {myBets.length ? (
                    myBets.map((bet) => {
                      const item = bet.items[0];
                      const statusColor = bet.status === 'OPEN' ? 'bg-blue-500/20 text-blue-400' : bet.status === 'WON' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/50';
                      return (
                        <div key={bet.id} className='rounded-2xl border border-white/8 bg-white/[0.03] p-4 transition-colors hover:border-white/15'>
                          <div className='flex justify-between items-start mb-3'>
                            <div>
                              <p className='text-sm font-medium'>{item?.eventName ?? 'Evento'}</p>
                              <p className='text-xs text-white/40'>{item?.stageLabel ?? '--'} • {item?.marketName ?? '--'}</p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusColor}`}>{bet.status}</span>
                          </div>
                          <div className='flex items-center justify-between text-xs'>
                            <span className='text-white/50'>{item?.oddLabel ?? '-'} • @{item?.oddAtPlacement?.toFixed(2) ?? '--'} • R$ {formatMoney(bet.stake)}</span>
                            <span className='font-medium text-emerald-400'>+ R$ {formatMoney(bet.potentialWin)}</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className='rounded-2xl border border-dashed border-white/10 p-8 text-center'>
                      <p className='text-sm text-white/40'>Nenhum bilhete encontrado</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Bilhete acumulado (sticky bottom) ── */}
      {cart.length > 0 && (
        <div className='fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-[#0a101d]/95 backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.6)]'>
          <div className='mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-4 lg:px-8'>
            <div className='flex items-center justify-between gap-3 mb-3'>
              <div className='flex items-center gap-2'>
                <span className='inline-flex items-center justify-center h-7 min-w-[28px] rounded-full bg-emerald-500 text-black text-xs font-bold px-2'>
                  {cart.length}
                </span>
                <p className='text-sm font-semibold'>Bilhete <span className='text-white/50'>(seleções)</span></p>
              </div>
              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  onClick={() => setCart([])}
                  className='text-xs text-white/50 hover:text-white/80'
                  disabled={cartSubmitting}
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className='max-h-[40vh] overflow-y-auto space-y-1.5 mb-3 pr-1'>
              {cart.map((item) => {
                const snap = snapshots[item.duelId];
                const sideData = item.side === 'LEFT' ? snap?.duel.left : snap?.duel.right;
                const oppData = item.side === 'LEFT' ? snap?.duel.right : snap?.duel.left;
                const odd = sideData?.odd ?? 0;
                const estReturn = item.stake * odd;
                return (
                  <div key={item.duelId} className='grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_120px_120px_auto] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2'>
                    <div className='min-w-0'>
                      <p className='text-xs font-semibold truncate'>
                        <span className={item.side === 'LEFT' ? 'text-blue-400' : 'text-orange-400'}>
                          {sideData?.label ?? '...'}
                        </span>
                        <span className='text-white/30 mx-1'>vs</span>
                        <span className='text-white/50'>{oppData?.label ?? '...'}</span>
                      </p>
                      <p className='text-[10px] text-white/40 mt-0.5'>
                        @{odd.toFixed(2)} · ~retorno R$ {formatMoney(estReturn)}
                      </p>
                    </div>
                    <div className='hidden sm:block text-right text-[10px] text-white/40'>
                      {item.side === 'LEFT' ? 'Lado azul' : 'Lado laranja'}
                    </div>
                    <div className='flex items-center gap-1'>
                      <span className='text-[10px] text-white/40'>R$</span>
                      <input
                        type='number'
                        inputMode='decimal'
                        min={minBet}
                        step={5}
                        value={item.stake}
                        onChange={(e) => cartUpdateStake(item.duelId, e.target.value)}
                        className='w-20 rounded-md border border-white/10 bg-[#090b11] px-2 py-1 text-sm font-semibold text-white outline-none focus:border-white/30'
                        disabled={cartSubmitting}
                      />
                    </div>
                    <button
                      type='button'
                      onClick={() => cartRemove(item.duelId)}
                      className='rounded-md w-7 h-7 flex items-center justify-center text-white/50 hover:bg-red-500/20 hover:text-red-300'
                      title='Remover do bilhete'
                      disabled={cartSubmitting}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-white/5 pt-3'>
              <div className='flex items-center gap-4 text-xs sm:text-sm'>
                <div>
                  <p className='text-[10px] uppercase tracking-widest text-white/40'>Total apostado</p>
                  <p className='font-bold text-white'>R$ {formatMoney(cartTotalStake)}</p>
                </div>
                <div>
                  <p className='text-[10px] uppercase tracking-widest text-white/40'>Saldo após</p>
                  <p className={`font-bold ${currentBalance - cartTotalStake < 0 ? 'text-red-400' : 'text-white'}`}>
                    R$ {formatMoney(currentBalance - cartTotalStake)}
                  </p>
                </div>
              </div>
              <button
                type='button'
                onClick={submitCart}
                disabled={cartSubmitting || !me || cartTotalStake > currentBalance || cart.some((c) => c.stake < minBet)}
                className='rounded-xl bg-emerald-400 px-5 py-3 text-sm font-extrabold text-black hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed'
              >
                {cartSubmitting ? 'Enviando...' : !me ? 'Faça login' : `Apostar ${cart.length} embate${cart.length !== 1 ? 's' : ''}`}
              </button>
            </div>
            <p className='mt-2 text-[10px] text-amber-200/70 leading-relaxed'>
              Mercado pari-mutuel: as cotações exibidas são estimativas. Acertando, você recebe no mínimo o valor apostado em cada embate.
            </p>
          </div>
        </div>
      )}

      {/* Spacer para conteúdo não ficar atrás do bilhete sticky */}
      {cart.length > 0 && <div className='h-48 sm:h-40' />}

      {/* Modal de resultado do bilhete enviado */}
      {cartResults && (
        <div className='fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4'>
          <div className='w-full max-w-md rounded-2xl border border-white/10 bg-[#101525] p-5 sm:p-6 shadow-2xl max-h-[80vh] flex flex-col'>
            <h3 className='text-lg sm:text-xl font-bold mb-1'>
              Bilhete enviado
            </h3>
            <p className='text-sm text-white/60 mb-4'>
              {cartResults.filter((r) => r.ok).length} de {cartResults.length} aposta(s) confirmadas.
            </p>
            <div className='space-y-2 overflow-y-auto flex-1 pr-1'>
              {cartResults.map((r, idx) => (
                <div key={`${r.duelId}-${idx}`} className={`rounded-lg border p-2.5 ${r.ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                  <div className='flex items-center justify-between gap-2'>
                    <p className={`text-sm font-semibold ${r.ok ? 'text-emerald-300' : 'text-red-300'}`}>
                      {r.ok ? '✓ Confirmada' : '✗ Falhou'}
                    </p>
                    {r.ok && r.potentialWin !== undefined && (
                      <p className='text-xs font-medium text-emerald-200'>~R$ {formatMoney(r.potentialWin)}</p>
                    )}
                  </div>
                  <p className='text-[11px] text-white/60 mt-0.5'>{r.message}</p>
                </div>
              ))}
            </div>
            <button
              type='button'
              onClick={() => setCartResults(null)}
              className='mt-4 w-full rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black hover:bg-white/90'
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirmOpen && (
        <div className='fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4'>
          <div className='w-full max-w-md rounded-2xl border border-white/10 bg-[#101525] p-6 shadow-2xl'>
            <h3 className='text-xl font-bold'>Confirmar aposta?</h3>
            <p className='mt-3 text-sm text-white/85'>
              Valor: <span className='font-bold text-emerald-400'>R$ {formatMoney(stake)}</span> no{' '}
              <span className='font-bold'>{selectedSide?.label ?? 'lado selecionado'}</span>
            </p>
            <p className='mt-1 text-sm text-white/70'>Retorno estimado: <span className='font-semibold text-emerald-300'>~ R$ {formatMoney(expectedReturn)}</span></p>
            <div className='mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2'>
              <p className='text-xs text-amber-100/90 leading-relaxed'>
                Mercado <strong className='text-amber-200'>pari-mutuel</strong>: o retorno final é calculado pelo rateio do pote no fechamento e pode ser diferente da estimativa acima. <strong>Acertando, você recebe no mínimo o valor apostado.</strong>
              </p>
            </div>
            <div className='mt-5 flex gap-2'>
              <button type='button' className='flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20' onClick={() => setConfirmOpen(false)} disabled={placingBet}>Cancelar</button>
              <button type='button' className='flex-1 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-extrabold text-black hover:bg-emerald-300 disabled:opacity-70' onClick={() => { setConfirmOpen(false); void placeBet(); }} disabled={placingBet}>
                {placingBet ? 'Enviando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function OddCard({ title, odd, pool, tickets, photoUrl, active, onClick, tone }: {
  title: string; odd?: number; pool?: number; tickets?: number; photoUrl?: string | null; active: boolean; onClick: () => void; tone: 'blue' | 'orange';
}) {
  const isBlue = tone === 'blue';
  const apiOrigin = (() => {
    try {
      const base = process.env.NEXT_PUBLIC_API_URL ?? '';
      return base.replace(/\/api\/?$/, '');
    } catch {
      return '';
    }
  })();
  const resolvedPhotoUrl = photoUrl
    ? (photoUrl.startsWith('http') ? photoUrl : `${apiOrigin}${photoUrl}`)
    : null;
  return (
    <button
      className={`group relative w-full overflow-hidden text-left transition-all duration-500 outline-none ${active ? 'scale-[1.02] shadow-2xl z-10' : 'hover:scale-[1.01] opacity-90 hover:opacity-100'}`}
      type='button' onClick={onClick}
    >
      <div className={`absolute inset-0 border-2 rounded-2xl sm:rounded-3xl transition-colors duration-300 ${active ? (isBlue ? 'border-blue-500' : 'border-orange-500') : 'border-transparent'}`} />
      <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-6 h-full flex flex-col justify-between relative overflow-hidden ${isBlue ? 'bg-gradient-to-br from-[#121c2d] to-[#0a101d]' : 'bg-gradient-to-br from-[#2d1c12] to-[#1d100a]'}`}>
        {resolvedPhotoUrl ? (
          <>
            <div
              className='absolute inset-0 bg-cover bg-center opacity-40 transition-opacity duration-500 group-hover:opacity-50'
              style={{ backgroundImage: `url(${resolvedPhotoUrl})` }}
              aria-hidden
            />
            <div
              className={`absolute inset-0 ${isBlue ? 'bg-gradient-to-t from-[#0a101d] via-[#0a101d]/70 to-[#0a101d]/20' : 'bg-gradient-to-t from-[#1d100a] via-[#1d100a]/70 to-[#1d100a]/20'}`}
              aria-hidden
            />
          </>
        ) : null}
        <div className={`absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl transition-opacity duration-500 ${active ? 'opacity-30' : 'opacity-0'} ${isBlue ? 'bg-blue-400' : 'bg-orange-400'}`} />
        <div className='relative z-10'>
          <div className='flex items-center gap-2 mb-2'>
            <div className={`w-2 h-2 rounded-full shadow-[0_0_10px_currentColor] ${isBlue ? 'text-blue-400 bg-blue-400' : 'text-orange-400 bg-orange-400'}`} />
            <p className='text-[10px] font-bold uppercase tracking-widest text-white/50'>Opção</p>
          </div>
          <p className='text-base sm:text-lg font-medium tracking-tight text-white/90 leading-tight min-h-[40px] sm:min-h-[50px]'>{title}</p>
        </div>
        <div className='relative z-10 mt-4 sm:mt-6 flex items-end justify-between gap-2'>
          <div className='min-w-0'>
            <p className='text-[10px] sm:text-xs font-semibold text-white/40 mb-0.5 sm:mb-1'>Cotação atual <span className='text-white/30'>(varia)</span></p>
            <div className='flex items-baseline gap-1'>
              <span className={`text-lg sm:text-xl font-medium ${isBlue ? 'text-blue-400' : 'text-orange-400'}`}>@</span>
              <p className='text-3xl sm:text-4xl font-bold tracking-tighter text-white'>{odd?.toFixed(2) ?? '--'}</p>
            </div>
          </div>
          <div className='text-right shrink-0'>
            <p className='text-[10px] font-medium uppercase tracking-widest text-white/30 mb-0.5 sm:mb-1'>Volume</p>
            <p className='text-[11px] sm:text-xs font-medium text-white/60'>R$ {formatMoney(pool ?? 0)}</p>
            <p className='text-[10px] text-white/40 mt-0.5'>{tickets ?? '--'} APOSTAS</p>
          </div>
        </div>
      </div>
    </button>
  );
}

function parseApiError(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as { message?: string | string[] };
  if (Array.isArray(candidate.message) && candidate.message[0]) return candidate.message[0];
  if (typeof candidate.message === 'string') return candidate.message;
  return null;
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return '0,00';
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCloseWindow(seconds: number) {
  if (seconds <= 0) return 'encerrado';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}min`;
}
