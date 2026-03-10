'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { MainNav } from '@/components/site/main-nav';
import { getAuthToken } from '@/lib/auth';
import { BettingBoard, MarketSnapshot } from '@/types/market';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3502/api';
const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3502/realtime';

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

export default function ApostasPage() {
  const [board, setBoard] = useState<BettingBoard | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, MarketSnapshot>>({});
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [selectedDuelId, setSelectedDuelId] = useState<string>('');
  const [stake, setStake] = useState<number>(100);
  const [side, setSide] = useState<'LEFT' | 'RIGHT'>('LEFT');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [placingBet, setPlacingBet] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [myBets, setMyBets] = useState<MyBet[]>([]);
  const [betEventFilter, setBetEventFilter] = useState<string>('ALL');
  const [betStageFilter, setBetStageFilter] = useState<string>('ALL');
  const [betStatusFilter, setBetStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    void loadBoardAndDefaults();
    void loadSession();
    void loadMyBets();
  }, []);

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

    socket.on('market:error', (payload: { message?: string }) => {
      setMessage(payload?.message ?? 'Não foi possível atualizar o mercado em tempo real');
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedDuelId]);

  const selectedEvent = useMemo(() => board?.events.find((event) => event.id === selectedEventId) ?? null, [board, selectedEventId]);
  const currentDuelId = selectedDuelId || selectedEvent?.currentDuelId || selectedEvent?.stages[0]?.duelId || '';
  const snapshot = currentDuelId ? snapshots[currentDuelId] : undefined;
  const selectedSide = side === 'LEFT' ? snapshot?.duel.left : snapshot?.duel.right;
  const expectedReturn = selectedSide ? stake * selectedSide.odd : 0;
  const currentBalance = Number(me?.wallet?.balance ?? 0);
  const balanceAfterBet = currentBalance - stake;

  const sideBlockedMessage = useMemo(() => {
    if (!snapshot) return '';
    if (snapshot.lockedSide === 'BOTH') return snapshot.lockMessage ?? 'As apostas estão pausadas temporariamente';

    const blockedSide = side === 'LEFT' ? snapshot.duel.left.locked : snapshot.duel.right.locked;
    if (!blockedSide) return '';
    return side === 'LEFT'
      ? 'Aposta no lado azul pausada no momento. Tente o lado laranja ou aguarde o reequilíbrio.'
      : 'Aposta no lado laranja pausada no momento. Tente o lado azul ou aguarde o reequilíbrio.';
  }, [side, snapshot]);

  const isGlobalLock = snapshot?.lockedSide === 'BOTH';
  const canBet = !!snapshot && !!me && stake >= 5 && currentBalance >= stake && !isGlobalLock && !sideBlockedMessage;
  const filteredBets = useMemo(() => {
    return myBets.filter((bet) => {
      const firstItem = bet.items[0];
      if (!firstItem) return false;

      if (betEventFilter !== 'ALL' && firstItem.eventId !== betEventFilter) return false;
      if (betStageFilter !== 'ALL' && firstItem.stageLabel !== betStageFilter) return false;
      if (betStatusFilter !== 'ALL' && bet.status !== betStatusFilter) return false;
      return true;
    });
  }, [myBets, betEventFilter, betStageFilter, betStatusFilter]);
  const betEventOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const bet of myBets) {
      const item = bet.items[0];
      if (item) map.set(item.eventId, item.eventName);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [myBets]);
  const betStageOptions = useMemo(() => {
    const set = new Set<string>();
    for (const bet of myBets) {
      const item = bet.items[0];
      if (item?.stageLabel) set.add(item.stageLabel);
    }
    return [...set];
  }, [myBets]);
  const betStatusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const bet of myBets) set.add(bet.status);
    return [...set];
  }, [myBets]);

  async function loadSession() {
    const token = getAuthToken();
    if (!token) return;

    try {
      const response = await fetch(`${apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      if (!response.ok) return;
      setMe((await response.json()) as MeResponse);
    } catch {
      // ignore session fetch errors here
    }
  }

  async function loadMyBets() {
    const token = getAuthToken();
    if (!token) return;

    try {
      const response = await fetch(`${apiUrl}/auth/my-bets`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      if (!response.ok) return;
      setMyBets((await response.json()) as MyBet[]);
    } catch {
      // ignore my-bets errors for page boot
    }
  }

  async function loadBoardAndDefaults() {
    setLoading(true);
    setMessage('');

    try {
      const [boardRes, snapshotRes] = await Promise.all([fetch(`${apiUrl}/market/board`), fetch(`${apiUrl}/market/snapshot`)]);

      if (!boardRes.ok || !snapshotRes.ok) {
        throw new Error('Não foi possível carregar os mercados de aposta agora');
      }

      const boardData = (await boardRes.json()) as BettingBoard;
      const firstSnapshot = (await snapshotRes.json()) as MarketSnapshot | null;

      setBoard(boardData);
      if (firstSnapshot) {
        setSnapshots({ [firstSnapshot.duelId]: firstSnapshot });
        setSelectedEventId(firstSnapshot.eventId);
        setSelectedDuelId(firstSnapshot.duelId);
      } else if (boardData.events.length > 0) {
        setSelectedEventId(boardData.events[0].id);
        setSelectedDuelId(boardData.events[0].currentDuelId ?? boardData.events[0].stages[0]?.duelId ?? '');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao carregar página de apostas');
    } finally {
      setLoading(false);
    }
  }

  async function placeBet() {
    if (!snapshot || !currentDuelId) return;

    const token = getAuthToken();
    if (!token) {
      setMessage('Faça login para confirmar apostas com saldo da carteira.');
      return;
    }

    setPlacingBet(true);
    setMessage('');

    try {
      const response = await fetch(`${apiUrl}/market/bet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ duelId: currentDuelId, side, amount: stake }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null as unknown);
        throw new Error(parseApiError(data) ?? 'Não foi possível confirmar sua aposta agora');
      }

      const data = (await response.json()) as {
        snapshot: MarketSnapshot;
        bet: { id: string; oddAtPlacement: number; potentialWin: number };
        wallet: { balance: number };
      };

      setSnapshots((prev) => ({ ...prev, [data.snapshot.duelId]: data.snapshot }));
      setMe((prev) => (prev ? { ...prev, wallet: { balance: data.wallet.balance, currency: prev.wallet?.currency ?? 'BRL' } } : prev));
      void loadMyBets();
      setMessage(
        `Aposta confirmada com sucesso. Ticket ${data.bet.id.slice(0, 8)} • odd ${data.bet.oddAtPlacement.toFixed(2)} • retorno potencial R$ ${data.bet.potentialWin.toFixed(2)}.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao enviar aposta');
    } finally {
      setPlacingBet(false);
    }
  }

  async function confirmAndPlaceBet() {
    setConfirmOpen(false);
    await placeBet();
  }

  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
        <MainNav />

        <section className='mt-2 rounded-2xl border border-white/10 bg-[#101525] p-5 sm:p-6'>
          <h1 className='text-2xl font-semibold sm:text-3xl'>Apostas 50/50 em tempo real</h1>
          <p className='mt-2 text-sm text-white/60'>Escolha o evento, a etapa e o carro para apostar.</p>
          <div className='mt-4 flex flex-wrap items-center gap-3 text-xs'>
            <span className={`inline-flex items-center rounded-full px-3 py-1.5 font-medium ${connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              <span className={`mr-2 h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
              {connected ? 'Ao vivo' : 'Reconectando...'}
            </span>
          </div>
        </section>

        {message ? <p className='mt-4 rounded-lg border border-white/20 bg-white/5 p-3 text-sm'>{message}</p> : null}

        {loading ? (
          <p className='mt-6 text-white/70'>Carregando mercados de apostas...</p>
        ) : (
          <section className='mt-4 grid gap-6 lg:grid-cols-[380px_1fr]'>
            <aside className='space-y-6'>

              <div className='space-y-4'>
                <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3'>Eventos Disponíveis</p>
                <div className='flex flex-col gap-2'>
                  {board?.events.map((event) => (
                    <button
                      key={event.id}
                      className={`group flex items-center justify-between rounded-2xl p-4 transition-all duration-300 ${selectedEventId === event.id
                        ? 'bg-gradient-to-r from-blue-500/25 to-blue-500/5 border-l-2 border-blue-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                        : 'bg-transparent hover:bg-white/5 border-l-2 border-transparent'
                        }`}
                      type='button'
                      onClick={() => {
                        setSelectedEventId(event.id);
                        setSelectedDuelId(event.currentDuelId ?? event.stages[0]?.duelId ?? '');
                      }}
                    >
                      <div className='text-left'>
                        <p className={`font-medium transition-colors ${selectedEventId === event.id ? 'text-blue-100' : 'text-white/70 group-hover:text-white'}`}>{event.name}</p>
                        <p className='mt-1 text-xs text-white/40'>{new Date(event.startAt).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      {selectedEventId === event.id && (
                        <div className='h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]' />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {selectedEvent && (
                <div className='space-y-4'>
                  <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3'>Etapas da Corrida</p>
                  <div className='flex flex-wrap gap-2'>
                    {(selectedEvent.stages ?? []).map((stage) => (
                      <button
                        key={stage.duelId}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ${currentDuelId === stage.duelId
                          ? 'bg-white text-[#090b11] shadow-lg scale-105'
                          : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                          }`}
                        type='button'
                        onClick={() => setSelectedDuelId(stage.duelId)}
                      >
                        {stage.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedEvent?.marketNames && selectedEvent.marketNames.length > 0 && (
                <div className='space-y-4'>
                  <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3'>Modalidades</p>
                  <div className='flex flex-wrap gap-2'>
                    {selectedEvent.marketNames.map((name) => (
                      <span key={name} className='rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/50 border border-white/5'>
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            <div className='space-y-6'>
              <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-white/5 pb-5'>
                <div>
                  <p className='text-[10px] font-semibold uppercase tracking-widest text-blue-400/70'>{snapshot?.stageLabel ?? 'Aguarde'}</p>
                  <h2 className='mt-1 text-2xl font-semibold tracking-tight'>{snapshot?.eventName ?? 'Selecionando...'}</h2>
                  <p className='mt-2 flex items-center gap-3 text-xs text-white/50'>
                    <span>Pote total: <strong className='text-white/80'>R$ {snapshot ? formatMoney(snapshot.totalPool) : '--'}</strong></span>
                    <span className='h-1 w-1 rounded-full bg-white/20'></span>
                    <span>Margem: <strong className='text-white/80'>{snapshot?.marginPercent ?? '--'}%</strong></span>
                  </p>
                </div>
                <div className='flex flex-col items-start sm:items-end gap-2'>
                  <p className='inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm font-medium border border-white/5'>
                    <svg className='h-4 w-4 text-emerald-400' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' />
                    </svg>
                    {snapshot ? formatCloseWindow(snapshot.closeInSeconds) : '--'}
                  </p>
                  {snapshot?.locked ? <p className='text-xs text-red-400 font-medium px-2'>{snapshot.lockMessage ?? 'Pausado'}</p> : null}
                </div>
              </div>

              <div className='glass rounded-3xl border border-white/8 p-6 relative overflow-hidden'>
                <div className='absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl'></div>
                <div className='absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl'></div>

                <p className='text-sm font-medium text-white/60 mb-5 relative z-10'>Em qual carro você vai apostar?</p>

                <div className='grid gap-4 md:grid-cols-2 relative z-10'>
                  <OddCard
                    title={snapshot?.duel.left.label ?? 'Carro da Esquerda'}
                    odd={snapshot?.duel.left.odd}
                    pool={snapshot?.duel.left.pool}
                    tickets={snapshot?.duel.left.tickets}
                    active={side === 'LEFT'}
                    locked={snapshot?.duel.left.locked}
                    onClick={() => setSide('LEFT')}
                    tone='blue'
                  />
                  <OddCard
                    title={snapshot?.duel.right.label ?? 'Carro da Direita'}
                    odd={snapshot?.duel.right.odd}
                    pool={snapshot?.duel.right.pool}
                    tickets={snapshot?.duel.right.tickets}
                    active={side === 'RIGHT'}
                    locked={snapshot?.duel.right.locked}
                    onClick={() => setSide('RIGHT')}
                    tone='orange'
                  />
                </div>

                <div className='mt-6 grid gap-6 lg:grid-cols-2 relative z-10'>
                  <div className='space-y-1 text-sm'>
                    <p className='text-white/40'>Sua seleção</p>
                    <p className='text-lg font-medium'>{selectedSide?.label ?? 'Nenhum selecionado'}</p>
                    <div className='h-2'></div>
                    <div className='flex justify-between border-b border-white/5 pb-2 text-white/60'>
                      <span>Saldo Total</span>
                      <span className='font-medium text-white'>R$ {formatMoney(currentBalance)}</span>
                    </div>
                    <div className='flex justify-between border-b border-white/5 py-2 text-white/60'>
                      <span>Saldo Final Estimado</span>
                      <span className={`font-medium ${balanceAfterBet < 0 ? 'text-red-400' : 'text-white'}`}>R$ {formatMoney(balanceAfterBet)}</span>
                    </div>
                    <div className='flex justify-between py-2 text-white/60'>
                      <span>Retorno Bruto</span>
                      <span className='font-semibold text-emerald-400'>R$ {formatMoney(expectedReturn)}</span>
                    </div>

                    {!me && <p className='mt-3 text-xs text-amber-400'>● Você precisa fazer login para apostar.</p>}
                    {stake < 5 && <p className='mt-1 text-xs text-amber-400'>● O valor mínimo é de R$ 5,00.</p>}
                    {me && currentBalance < stake && <p className='mt-1 text-xs text-red-400'>● Saldo insuficiente para este valor.</p>}
                    {sideBlockedMessage && <p className='mt-1 text-xs text-amber-400'>● {sideBlockedMessage}</p>}
                  </div>

                  <div className='flex flex-col justify-end gap-3'>
                    <div className='relative'>
                      <span className='absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-medium'>R$</span>
                      <input
                        className='w-full rounded-2xl border border-white/10 bg-[#090b11]/50 py-4 pl-12 pr-4 text-2xl font-semibold text-white transition-all focus:border-white/30 focus:outline-none focus:ring-4 focus:ring-white/5'
                        type='number'
                        min={5}
                        step={5}
                        value={stake}
                        onChange={(e) => setStake(Number(e.target.value || 0))}
                      />
                    </div>
                    <button
                      type='button'
                      className='w-full rounded-2xl bg-white px-4 py-4 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all hover:bg-white/90 hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(255,255,255,0.25)] focus:scale-95 disabled:opacity-50 disabled:pointer-events-none'
                      disabled={!canBet || placingBet}
                      onClick={() => setConfirmOpen(true)}
                    >
                      {placingBet ? 'Processando envio...' : 'Confirmar Bilhete ->'}
                    </button>
                  </div>
                </div>
              </div>

              <article className='mt-2 rounded-2xl border border-white/10 bg-[#101525] p-5'>
                <div className='flex items-center justify-between mb-4'>
                  <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30'>Histórico de cotações</p>
                  <span className='text-[10px] text-white/20'>{(snapshot?.history ?? []).length} registros</span>
                </div>
                <div className='max-h-64 space-y-2 overflow-auto pr-1'>
                  {(snapshot?.history ?? []).slice().reverse().map((point) => (
                    <div key={`${point.at}-${point.leftOdd}-${point.rightOdd}`} className='group rounded-xl border border-white/5 bg-gradient-to-r from-white/[0.02] to-transparent p-3 transition-colors hover:border-white/10'>
                      <div className='flex items-center justify-between gap-4'>
                        <div className='flex items-center gap-3'>
                          <span className='text-[10px] text-white/30 tabular-nums w-14 shrink-0'>{new Date(point.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                          <div className='flex items-center gap-2'>
                            <div className='flex items-baseline gap-1'>
                              <span className='text-[10px] text-blue-400'>@</span>
                              <span className='text-sm font-semibold tabular-nums'>{point.leftOdd.toFixed(2)}</span>
                            </div>
                            <span className='text-white/15'>/</span>
                            <div className='flex items-baseline gap-1'>
                              <span className='text-[10px] text-orange-400'>@</span>
                              <span className='text-sm font-semibold tabular-nums'>{point.rightOdd.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                        <div className='text-right text-[10px] text-white/25 tabular-nums hidden sm:block'>
                          R$ {formatMoney(point.leftPool)} / R$ {formatMoney(point.rightPool)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <div className='space-y-4 pt-8 mt-8 border-t border-white/8'>
                <p className='text-lg font-semibold tracking-tight'>Meus Bilhetes</p>

                <div className='flex flex-wrap gap-2'>
                  <select
                    className='appearance-none rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-4 py-2 pr-8 text-xs text-white/80 outline-none transition-colors hover:bg-white/10 focus:border-white/20 cursor-pointer bg-[url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2212%22%20height%3D%2212%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M2%204l4%204%204-4%22%20stroke%3D%22%23ffffff%22%20stroke-width%3D%221.5%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20opacity%3D%220.5%22%2F%3E%3C%2Fsvg%3E")] bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat'
                    value={betEventFilter}
                    onChange={(e) => setBetEventFilter(e.target.value)}
                  >
                    <option value='ALL' className='bg-[#101525]'>Todos Eventos</option>
                    {betEventOptions.map((event) => (
                      <option key={event.id} value={event.id} className='bg-[#101525]'>{event.name}</option>
                    ))}
                  </select>

                  <select
                    className='appearance-none rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-4 py-2 pr-8 text-xs text-white/80 outline-none transition-colors hover:bg-white/10 focus:border-white/20 cursor-pointer bg-[url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2212%22%20height%3D%2212%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M2%204l4%204%204-4%22%20stroke%3D%22%23ffffff%22%20stroke-width%3D%221.5%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20opacity%3D%220.5%22%2F%3E%3C%2Fsvg%3E")] bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat'
                    value={betStageFilter}
                    onChange={(e) => setBetStageFilter(e.target.value)}
                  >
                    <option value='ALL' className='bg-[#101525]'>Todas as Etapas</option>
                    {betStageOptions.map((stage) => (
                      <option key={stage} value={stage} className='bg-[#101525]'>{stage}</option>
                    ))}
                  </select>

                  <select
                    className='appearance-none rounded-full border border-white/10 bg-white/5 backdrop-blur-md px-4 py-2 pr-8 text-xs text-white/80 outline-none transition-colors hover:bg-white/10 focus:border-white/20 cursor-pointer bg-[url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2212%22%20height%3D%2212%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M2%204l4%204%204-4%22%20stroke%3D%22%23ffffff%22%20stroke-width%3D%221.5%22%20fill%3D%22none%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20opacity%3D%220.5%22%2F%3E%3C%2Fsvg%3E")] bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat'
                    value={betStatusFilter}
                    onChange={(e) => setBetStatusFilter(e.target.value)}
                  >
                    <option value='ALL' className='bg-[#101525]'>Qualquer Status</option>
                    {betStatusOptions.map((status) => (
                      <option key={status} value={status} className='bg-[#101525]'>{status}</option>
                    ))}
                  </select>
                </div>

                <div className='mt-5 max-h-96 space-y-3 overflow-auto pr-2'>
                  {filteredBets.length ? (
                    filteredBets.map((bet) => {
                      const item = bet.items[0];
                      const statusColor = bet.status === 'OPEN' ? 'bg-blue-500/20 text-blue-400' : bet.status === 'WON' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/50';

                      return (
                        <div key={bet.id} className='group rounded-2xl border border-white/8 bg-gradient-to-br from-white/[0.04] to-transparent p-5 transition-colors hover:border-white/15 hover:bg-white/5'>
                          <div className='flex justify-between items-start mb-4'>
                            <div>
                              <p className='text-sm font-medium text-white/90'>{item?.eventName ?? 'Evento Desconhecido'}</p>
                              <p className='text-xs text-white/50'>{item?.stageLabel ?? '--'} • {item?.marketName ?? '--'}</p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider ${statusColor}`}>
                              {bet.status}
                            </span>
                          </div>

                          <div className='grid grid-cols-2 gap-4 rounded-xl bg-[#090b11]/50 p-3'>
                            <div>
                              <p className='text-[10px] font-medium uppercase tracking-wider text-white/40'>Sua Seleção</p>
                              <p className='text-sm font-medium text-white/90 mt-0.5'>{item?.oddLabel ?? '-'}</p>
                            </div>
                            <div>
                              <p className='text-[10px] font-medium uppercase tracking-wider text-white/40'>Odd / Valor</p>
                              <p className='text-sm text-white/70 mt-0.5'>@{item?.oddAtPlacement?.toFixed(2) ?? '--'} <span className='mx-1'>•</span> R$ {formatMoney(bet.stake)}</p>
                            </div>
                          </div>

                          <div className='mt-4 flex items-center justify-between text-xs'>
                            <p className='text-white/40'>#{bet.id.slice(0, 8)} • {new Date(bet.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                            <p className='font-medium text-emerald-400'>+ R$ {formatMoney(bet.potentialWin)}</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className='rounded-2xl border border-dashed border-white/10 p-8 text-center'>
                      <svg className='mx-auto h-8 w-8 text-white/20' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                        <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={1} d='M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' />
                      </svg>
                      <p className='mt-2 text-sm text-white/40'>Nenhum bilhete encontrado</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {confirmOpen ? (
        <div className='fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4'>
          <div className='w-full max-w-md rounded-2xl border border-white/10 bg-[#101525] p-6 shadow-2xl'>
            <p className='text-sm font-semibold text-white/80'>Confirmar aposta</p>
            <h3 className='mt-2 text-xl font-bold'>Deseja confirmar esta aposta?</h3>
            <p className='mt-3 text-sm text-white/85'>
              Deseja confirmar o bilhete no valor de <span className='font-bold text-emerald-400'>R$ {formatMoney(stake)}</span> no{' '}
              <span className='font-bold text-white'>{selectedSide?.label ?? 'lado selecionado'}</span>?
            </p>
            <p className='mt-1 text-sm text-white/70'>
              Retorno potencial: <span className='font-semibold text-emerald-300'>R$ {formatMoney(expectedReturn)}</span>
            </p>
            <p className='text-sm text-white/70'>
              Saldo após aposta: <span className='font-semibold text-white'>R$ {formatMoney(balanceAfterBet)}</span>
            </p>

            <div className='mt-5 flex gap-2'>
              <button
                type='button'
                className='flex-1 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20'
                onClick={() => setConfirmOpen(false)}
                disabled={placingBet}
              >
                Cancelar
              </button>
              <button
                type='button'
                className='flex-1 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-extrabold text-black hover:bg-emerald-300 disabled:opacity-70'
                onClick={() => void confirmAndPlaceBet()}
                disabled={placingBet}
              >
                {placingBet ? 'Enviando...' : 'Sim, confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function OddCard({
  title,
  odd,
  pool,
  tickets,
  locked,
  active,
  onClick,
  tone,
}: {
  title: string;
  odd?: number;
  pool?: number;
  tickets?: number;
  locked?: boolean;
  active: boolean;
  onClick: () => void;
  tone: 'blue' | 'orange';
}) {
  const isBlue = tone === 'blue';

  return (
    <button
      className={`group relative w-full overflow-hidden text-left transition-all duration-500 ease-out outline-none ${active
        ? 'scale-[1.02] shadow-2xl z-10'
        : 'hover:scale-[1.01] hover:z-0 opacity-90 hover:opacity-100'
        } ${locked ? 'grayscale opacity-40 hover:scale-100 pointer-events-none' : ''}`}
      type='button'
      onClick={onClick}
      disabled={locked}
    >
      <div className={`absolute inset-0 border-2 rounded-3xl transition-colors duration-300 ${active ? (isBlue ? 'border-blue-500' : 'border-orange-500') : 'border-transparent'}`} />

      <div className={`rounded-3xl p-6 h-full flex flex-col justify-between ${isBlue ? 'bg-gradient-to-br from-[#121c2d] to-[#0a101d]' : 'bg-gradient-to-br from-[#2d1c12] to-[#1d100a]'}`}>

        <div className={`absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl transition-opacity duration-500 ${active ? 'opacity-30' : 'opacity-0'} ${isBlue ? 'bg-blue-400' : 'bg-orange-400'}`} />

        <div className='relative z-10'>
          <div className='flex items-center gap-2 mb-2'>
            <div className={`w-2 h-2 rounded-full shadow-[0_0_10px_currentColor] ${isBlue ? 'text-blue-400 bg-blue-400' : 'text-orange-400 bg-orange-400'}`} />
            <p className='text-[10px] font-bold uppercase tracking-widest text-white/50'>Opção</p>
          </div>
          <p className='text-lg font-medium tracking-tight text-white/90 leading-tight min-h-[50px]'>{title}</p>
        </div>

        <div className='relative z-10 mt-6 flex items-end justify-between'>
          <div>
            <p className='text-xs font-semibold text-white/40 mb-1'>Cotação</p>
            <div className='flex items-baseline gap-1'>
              <span className={`text-xl font-medium ${isBlue ? 'text-blue-400' : 'text-orange-400'}`}>@</span>
              <p className='text-4xl font-bold tracking-tighter text-white'>{odd?.toFixed(2) ?? '--'}</p>
            </div>
          </div>

          <div className='text-right'>
            <p className='text-[10px] font-medium uppercase tracking-widest text-white/30 mb-1'>Volume</p>
            <p className='text-xs font-medium text-white/60'>R$ {formatMoney(pool ?? 0)}</p>
            <p className='text-[10px] text-white/40 mt-0.5'>{tickets ?? '--'} APOSTAS</p>
          </div>
        </div>

        {locked && (
          <div className='absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-3xl z-20'>
            <p className='text-white/90 font-bold uppercase tracking-widest text-sm bg-black/80 px-4 py-2 rounded-full border border-white/10'>Pausado</p>
          </div>
        )}
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
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${seconds % 60}s`;

  const closeAt = new Date(Date.now() + seconds * 1000);
  return closeAt.toLocaleString('pt-BR');
}
