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

        <section className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
          <p className='text-xs font-bold uppercase tracking-[0.18em] text-amber-300'>Apostas 50/50 em tempo real</p>
          <h1 className='mt-2 text-3xl font-bold'>Escolha o evento, a etapa e o carro para apostar com clareza</h1>
          <div className='mt-3 flex flex-wrap items-center gap-3 text-xs'>
            <span className={`rounded-full px-3 py-1 font-bold ${connected ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/20 text-amber-200'}`}>
              {connected ? 'Atualização ao vivo conectada' : 'Reconectando atualização ao vivo'}
            </span>
            <span className='rounded-full bg-white/10 px-3 py-1 text-white/70'>Sem necessidade de atualizar a página</span>
          </div>
        </section>

        {message ? <p className='mt-4 rounded-lg border border-white/20 bg-white/5 p-3 text-sm'>{message}</p> : null}

        {loading ? (
          <p className='mt-6 text-white/70'>Carregando mercados de apostas...</p>
        ) : (
          <section className='mt-6 grid gap-5 lg:grid-cols-[0.95fr_1.35fr]'>
            <aside className='space-y-4'>
              <article className='rounded-2xl border border-white/10 bg-[#101525] p-4'>
                <p className='text-xs font-bold uppercase tracking-[0.16em] text-cyan-300'>1) Escolha o evento</p>
                <div className='mt-3 space-y-2'>
                  {board?.events.map((event) => (
                    <button
                      key={event.id}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedEventId === event.id ? 'border-cyan-400/60 bg-cyan-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                      type='button'
                      onClick={() => {
                        setSelectedEventId(event.id);
                        setSelectedDuelId(event.currentDuelId ?? event.stages[0]?.duelId ?? '');
                      }}
                    >
                      <p className='font-semibold'>{event.name}</p>
                      <p className='text-xs text-white/65'>{new Date(event.startAt).toLocaleString('pt-BR')} • {event.status}</p>
                    </button>
                  ))}
                </div>
              </article>

              <article className='rounded-2xl border border-white/10 bg-[#101525] p-4'>
                <p className='text-xs font-bold uppercase tracking-[0.16em] text-emerald-300'>2) Modalidades disponíveis</p>
                <div className='mt-3 flex flex-wrap gap-2'>
                  {(selectedEvent?.marketNames ?? []).map((name) => (
                    <span key={name} className='rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs'>
                      {name}
                    </span>
                  ))}
                </div>
              </article>

              <article className='rounded-2xl border border-white/10 bg-[#101525] p-4'>
                <p className='text-xs font-bold uppercase tracking-[0.16em] text-amber-300'>3) Etapa / corrida atual</p>
                <div className='mt-3 space-y-2'>
                  {(selectedEvent?.stages ?? []).map((stage) => (
                    <button
                      key={stage.duelId}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${currentDuelId === stage.duelId ? 'border-amber-300/60 bg-amber-400/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                      type='button'
                      onClick={() => setSelectedDuelId(stage.duelId)}
                    >
                      <p className='font-semibold'>{stage.label}</p>
                      <p className='text-white/70'>Largada: {new Date(stage.startsAt).toLocaleString('pt-BR')}</p>
                      <p className='text-white/60'>Fechamento das apostas: {new Date(stage.bookingCloseAt).toLocaleString('pt-BR')}</p>
                    </button>
                  ))}
                </div>
              </article>
            </aside>

            <div className='space-y-4'>
              <article className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div>
                    <p className='text-xs uppercase tracking-[0.14em] text-white/60'>{snapshot?.stageLabel ?? 'Corrida selecionada'}</p>
                    <h2 className='text-2xl font-bold'>{snapshot?.eventName ?? 'Selecione uma corrida'}</h2>
                    <p className='text-sm text-white/70'>Pote total: R$ {snapshot ? formatMoney(snapshot.totalPool) : '--'} • Margem da casa: {snapshot?.marginPercent ?? '--'}%</p>
                  </div>
                  <div className='text-right text-sm'>
                    <p className='rounded-full bg-white/10 px-3 py-1'>Fechamento: {snapshot ? formatCloseWindow(snapshot.closeInSeconds) : '--'}</p>
                    {snapshot?.locked ? <p className='mt-2 text-amber-300'>{snapshot.lockMessage ?? 'Apostas pausadas no momento'}</p> : null}
                  </div>
                </div>
              </article>

              <article className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
                <p className='mb-3 text-sm font-bold'>4) Escolha em qual carro você quer apostar</p>
                <div className='grid gap-4 md:grid-cols-2'>
                  <OddCard
                    title={snapshot?.duel.left.label ?? 'Lado azul'}
                    odd={snapshot?.duel.left.odd}
                    pool={snapshot?.duel.left.pool}
                    tickets={snapshot?.duel.left.tickets}
                    active={side === 'LEFT'}
                    locked={snapshot?.duel.left.locked}
                    onClick={() => setSide('LEFT')}
                    tone='blue'
                  />
                  <OddCard
                    title={snapshot?.duel.right.label ?? 'Lado laranja'}
                    odd={snapshot?.duel.right.odd}
                    pool={snapshot?.duel.right.pool}
                    tickets={snapshot?.duel.right.tickets}
                    active={side === 'RIGHT'}
                    locked={snapshot?.duel.right.locked}
                    onClick={() => setSide('RIGHT')}
                    tone='orange'
                  />
                </div>

                <div className='mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm'>
                  <p className='font-semibold'>Resumo da sua aposta</p>
                  <p className='mt-2 text-white/80'>Você está apostando em: <span className='font-bold text-white'>{selectedSide?.label ?? 'Selecione um lado'}</span></p>
                  <p className='text-white/80'>Valor da aposta: <span className='font-bold text-white'>R$ {formatMoney(stake)}</span></p>
                  <p className='text-white/80'>Retorno potencial: <span className='font-bold text-emerald-300'>R$ {formatMoney(expectedReturn)}</span></p>
                  <p className='text-white/80'>Saldo atual: <span className='font-bold text-white'>R$ {formatMoney(currentBalance)}</span></p>
                  <p className='text-white/80'>Saldo após aposta: <span className={`font-bold ${balanceAfterBet < 0 ? 'text-red-300' : 'text-white'}`}>R$ {formatMoney(balanceAfterBet)}</span></p>
                  {!me ? <p className='mt-2 text-amber-300'>Faça login para apostar com saldo da carteira.</p> : null}
                  {stake < 5 ? <p className='mt-1 text-amber-300'>Valor mínimo por aposta: R$ 5,00.</p> : null}
                  {me && currentBalance < stake ? <p className='mt-1 text-red-300'>Seu saldo não é suficiente para esse valor.</p> : null}
                  {sideBlockedMessage ? <p className='mt-1 text-amber-300'>{sideBlockedMessage}</p> : null}
                </div>

                <div className='mt-4 grid gap-3 sm:grid-cols-[1fr_auto]'>
                  <input
                    className='field'
                    type='number'
                    min={5}
                    step={5}
                    value={stake}
                    onChange={(e) => setStake(Number(e.target.value || 0))}
                  />
                  <button type='button' className='btn-primary' disabled={!canBet || placingBet} onClick={() => setConfirmOpen(true)}>
                    {placingBet ? 'Confirmando...' : 'Confirmar aposta'}
                  </button>
                </div>
              </article>

              <article className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
                <p className='text-sm font-bold'>Histórico das mudanças de cotações</p>
                <div className='mt-3 max-h-56 space-y-2 overflow-auto pr-1'>
                  {(snapshot?.history ?? []).slice().reverse().map((point) => (
                    <p key={`${point.at}-${point.leftOdd}-${point.rightOdd}`} className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80'>
                      {new Date(point.at).toLocaleTimeString('pt-BR')} • Azul {point.leftOdd.toFixed(2)} / Laranja {point.rightOdd.toFixed(2)} • Potes R$ {formatMoney(point.leftPool)} / R$ {formatMoney(point.rightPool)}
                    </p>
                  ))}
                </div>
              </article>

              <article className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
                <p className='text-sm font-bold'>Minhas apostas nesta conta</p>
                <p className='mt-1 text-xs text-white/65'>Filtre por evento, etapa e status para localizar rapidamente seus tickets.</p>

                <div className='mt-3 grid gap-2 md:grid-cols-3'>
                  <select className='field' value={betEventFilter} onChange={(e) => setBetEventFilter(e.target.value)}>
                    <option value='ALL'>Todos os eventos</option>
                    {betEventOptions.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.name}
                      </option>
                    ))}
                  </select>

                  <select className='field' value={betStageFilter} onChange={(e) => setBetStageFilter(e.target.value)}>
                    <option value='ALL'>Todas as etapas</option>
                    {betStageOptions.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>

                  <select className='field' value={betStatusFilter} onChange={(e) => setBetStatusFilter(e.target.value)}>
                    <option value='ALL'>Todos os status</option>
                    {betStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className='mt-3 max-h-72 space-y-2 overflow-auto pr-1'>
                  {filteredBets.length ? (
                    filteredBets.map((bet) => {
                      const item = bet.items[0];
                      return (
                        <div key={bet.id} className='rounded-lg border border-white/10 bg-white/5 p-3 text-sm'>
                          <p className='font-semibold'>
                            Ticket {bet.id.slice(0, 8)} • {item?.eventName ?? 'Evento'}
                          </p>
                          <p className='text-white/75'>
                            {item?.stageLabel ?? 'Etapa'} • {item?.marketName ?? '-'} • seleção: {item?.oddLabel ?? '-'}
                          </p>
                          <p className='text-white/70'>
                            Odd na entrada: {item?.oddAtPlacement?.toFixed(2) ?? '--'} • aposta R$ {formatMoney(bet.stake)} • retorno potencial R$ {formatMoney(bet.potentialWin)}
                          </p>
                          <p className='text-white/60'>{new Date(bet.createdAt).toLocaleString('pt-BR')} • status {bet.status}</p>
                        </div>
                      );
                    })
                  ) : (
                    <p className='text-sm text-white/60'>Nenhuma aposta encontrada para os filtros selecionados.</p>
                  )}
                </div>
              </article>
            </div>
          </section>
        )}
      </div>

      {confirmOpen ? (
        <div className='fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4'>
          <div className='w-full max-w-md rounded-2xl border border-white/15 bg-[#101525] p-5 shadow-2xl'>
            <p className='text-xs font-bold uppercase tracking-[0.14em] text-amber-300'>Confirmar aposta</p>
            <h3 className='mt-2 text-xl font-bold'>Deseja confirmar esta aposta?</h3>
            <p className='mt-3 text-sm text-white/85'>
              Deseja apostar <span className='font-bold text-emerald-300'>R$ {formatMoney(stake)}</span> no{' '}
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
  const bg = tone === 'blue' ? 'from-sky-600 to-blue-500' : 'from-orange-500 to-amber-400';

  return (
    <button
      className={`w-full rounded-xl border p-4 text-left transition ${active ? 'border-cyan-300/60 bg-cyan-500/10' : 'border-white/10 bg-white/5'} ${locked ? 'opacity-55' : 'hover:border-white/20'}`}
      type='button'
      onClick={onClick}
      disabled={locked}
    >
      <div className={`rounded-xl bg-gradient-to-br ${bg} p-4`}>
        <p className='text-xs uppercase tracking-[0.12em] text-white/80'>Booking 50/50</p>
        <p className='mt-1 text-base font-bold'>{title}</p>
        <p className='mt-2 text-3xl font-extrabold'>{odd?.toFixed(2) ?? '--'}</p>
      </div>
      <p className='mt-2 text-sm text-white/80'>Pote deste lado: R$ {formatMoney(pool ?? 0)}</p>
      <p className='text-sm text-white/70'>Total de apostas neste lado: {tickets ?? '--'} {locked ? '• PAUSADO' : ''}</p>
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
