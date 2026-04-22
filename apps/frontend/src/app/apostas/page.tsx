'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { MainNav } from '@/components/site/main-nav';
import { apiFetch } from '@/lib/api-request';
import { getPublicApiUrl, getPublicWsUrl } from '@/lib/env-public';
import { BettingBoard, MarketSnapshot, MultiRunnerSnapshot } from '@/types/market';
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

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'passadas', label: 'Passadas', icon: '🏁' },
  { id: 'vencedor', label: 'Vencedor Geral', icon: '🏆' },
  { id: 'reacao', label: 'Reações Baixas', icon: '⏱' },
  { id: 'queimada', label: 'Queimadas', icon: '🔥' },
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
  const [activeTab, setActiveTab] = useState<Tab>('passadas');
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

    socket.on('market:multi-runner:update', (payload: MultiRunnerSnapshot) => {
      setMultiRunnerSnapshots((prev) => ({ ...prev, [payload.marketId]: payload }));
    });

    return () => { socket.disconnect(); };
  }, [selectedDuelId]);

  const selectedEvent = useMemo(() => board?.events.find((e) => e.id === selectedEventId) ?? null, [board, selectedEventId]);
  const currentDuelId = selectedDuelId || selectedEvent?.currentDuelId || selectedEvent?.stages[0]?.duelId || '';
  const snapshot = currentDuelId ? snapshots[currentDuelId] : undefined;
  const selectedSide = side === 'LEFT' ? snapshot?.duel.left : snapshot?.duel.right;
  const expectedReturn = selectedSide ? stake * selectedSide.odd : 0;
  const currentBalance = Number(me?.wallet?.balance ?? 0);
  const balanceAfterBet = currentBalance - stake;
  const canBet = !!snapshot && !!me && stake >= 10 && currentBalance >= stake;

  // Multi-runner markets for the selected event, grouped by type
  const eventMultiRunnerMarkets = useMemo(() => {
    if (!selectedEventId) return [];
    return Object.values(multiRunnerSnapshots).filter((mr) => mr.eventId === selectedEventId);
  }, [multiRunnerSnapshots, selectedEventId]);

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
      const [boardRes, snapshotRes] = await Promise.all([fetch(`${apiUrl}/market/board`), fetch(`${apiUrl}/market/snapshot`)]);
      if (!boardRes.ok || !snapshotRes.ok) throw new Error('Não foi possível carregar os mercados');
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
      setMessage(error instanceof Error ? error.message : 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
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
      void loadMyBets();
      setMessage(`Aposta confirmada! Ticket ${data.bet.id.slice(0, 8)} • odd ${data.bet.oddAtPlacement.toFixed(2)} • retorno R$ ${data.bet.potentialWin.toFixed(2)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao enviar aposta');
    } finally { setPlacingBet(false); }
  }

  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
        <MainNav />

        {/* Header */}
        <section className='mt-2 rounded-2xl border border-white/10 bg-[#101525] p-5 sm:p-6'>
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-2xl font-semibold sm:text-3xl'>Apostas em tempo real</h1>
              <p className='mt-1 text-sm text-white/60'>Escolha o evento e a modalidade para apostar.</p>
            </div>
            <div className='flex items-center gap-4'>
              {me && (
                <div className='text-right'>
                  <p className='text-[10px] text-white/40 uppercase tracking-wider'>Saldo</p>
                  <p className='text-lg font-bold text-emerald-400'>R$ {formatMoney(currentBalance)}</p>
                </div>
              )}
              <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium ${connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                <span className={`mr-2 h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                {connected ? 'Ao vivo' : 'Reconectando...'}
              </span>
            </div>
          </div>
        </section>

        {message && <p className='mt-4 rounded-lg border border-white/20 bg-white/5 p-3 text-sm'>{message}</p>}

        {loading ? (
          <p className='mt-6 text-white/70'>Carregando mercados...</p>
        ) : (
          <>
            {/* Event selector */}
            <div className='mt-4 flex flex-wrap gap-2'>
              {board?.events.map((event) => (
                <button
                  key={event.id}
                  type='button'
                  className={`rounded-xl px-5 py-3 text-sm font-medium transition-all ${selectedEventId === event.id
                    ? 'bg-white text-[#090b11] shadow-lg'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/5'
                  }`}
                  onClick={() => {
                    setSelectedEventId(event.id);
                    setSelectedDuelId(event.currentDuelId ?? event.stages[0]?.duelId ?? '');
                    setActiveTab('passadas');
                  }}
                >
                  {event.name}
                </button>
              ))}
            </div>

            {/* Tabs por modalidade */}
            <div className='mt-4 flex gap-1 rounded-xl bg-[#101525] p-1 border border-white/10'>
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type='button'
                  className={`flex-1 rounded-lg px-4 py-3 text-sm font-semibold transition-all text-center ${activeTab === tab.id
                    ? 'bg-white text-[#090b11] shadow-lg'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className='block text-lg mb-0.5'>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            <div className='mt-6'>
              {/* ── TAB: PASSADAS (Duelos) ── */}
              {activeTab === 'passadas' && (
                <div className='space-y-6'>
                  {/* Stage selector */}
                  {selectedEvent && selectedEvent.stages.length > 1 && (
                    <div className='flex flex-wrap gap-2'>
                      {selectedEvent.stages.map((stage) => (
                        <button
                          key={stage.duelId}
                          type='button'
                          className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${currentDuelId === stage.duelId
                            ? 'bg-blue-500 text-white shadow-lg'
                            : 'bg-white/5 text-white/60 hover:bg-white/10'
                          }`}
                          onClick={() => setSelectedDuelId(stage.duelId)}
                        >
                          {stage.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {snapshot ? (
                    <>
                      {/* Duel header */}
                      <div className='flex items-end justify-between border-b border-white/5 pb-4'>
                        <div>
                          <p className='text-[10px] font-semibold uppercase tracking-widest text-blue-400/70'>{snapshot.stageLabel}</p>
                          <h2 className='mt-1 text-2xl font-semibold tracking-tight'>{snapshot.eventName}</h2>
                          <p className='mt-1 text-xs text-white/50'>
                            Pote: <strong className='text-white/80'>R$ {formatMoney(snapshot.totalPool)}</strong>
                            <span className='mx-2'>•</span>
                            Margem: <strong className='text-white/80'>{snapshot.marginPercent}%</strong>
                          </p>
                        </div>
                      </div>

                      {/* Pool distribution bar */}
                      {snapshot.totalPool > 0 && (
                        <div className='flex h-2 rounded-full overflow-hidden gap-[2px]'>
                          <div className='bg-blue-500 transition-all duration-500' style={{ width: `${(snapshot.duel.left.pool / snapshot.totalPool * 100)}%` }} />
                          <div className='bg-orange-500 transition-all duration-500' style={{ width: `${(snapshot.duel.right.pool / snapshot.totalPool * 100)}%` }} />
                        </div>
                      )}

                      {/* Odd cards */}
                      <div className='grid gap-4 md:grid-cols-2'>
                        <OddCard title={snapshot.duel.left.label} odd={snapshot.duel.left.odd} pool={snapshot.duel.left.pool} tickets={snapshot.duel.left.tickets} active={side === 'LEFT'} onClick={() => setSide('LEFT')} tone='blue' />
                        <OddCard title={snapshot.duel.right.label} odd={snapshot.duel.right.odd} pool={snapshot.duel.right.pool} tickets={snapshot.duel.right.tickets} active={side === 'RIGHT'} onClick={() => setSide('RIGHT')} tone='orange' />
                      </div>

                      {/* Bet form */}
                      <div className='rounded-2xl border border-white/8 bg-white/[0.02] p-6'>
                        <div className='grid gap-6 lg:grid-cols-2'>
                          <div className='space-y-1 text-sm'>
                            <p className='text-white/40'>Sua seleção</p>
                            <p className='text-lg font-medium'>{selectedSide?.label ?? 'Nenhum'}</p>
                            <div className='h-2' />
                            <div className='flex justify-between border-b border-white/5 pb-2 text-white/60'>
                              <span>Saldo</span>
                              <span className='font-medium text-white'>R$ {formatMoney(currentBalance)}</span>
                            </div>
                            <div className='flex justify-between border-b border-white/5 py-2 text-white/60'>
                              <span>Saldo após aposta</span>
                              <span className={`font-medium ${balanceAfterBet < 0 ? 'text-red-400' : 'text-white'}`}>R$ {formatMoney(balanceAfterBet)}</span>
                            </div>
                            <div className='flex justify-between py-2 text-white/60'>
                              <span>Retorno bruto</span>
                              <span className='font-semibold text-emerald-400'>R$ {formatMoney(expectedReturn)}</span>
                            </div>
                            {!me && <p className='mt-3 text-xs text-amber-400'>Faça login para apostar.</p>}
                            {stake < 10 && <p className='mt-1 text-xs text-amber-400'>Valor mínimo: R$ 10,00.</p>}
                            {me && currentBalance < stake && <p className='mt-1 text-xs text-red-400'>Saldo insuficiente.</p>}
                          </div>
                          <div className='flex flex-col justify-end gap-3'>
                            <div className='relative'>
                              <span className='absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-medium'>R$</span>
                              <input className='w-full rounded-2xl border border-white/10 bg-[#090b11]/50 py-4 pl-12 pr-4 text-2xl font-semibold text-white focus:border-white/30 focus:outline-none' type='number' min={10} step={10} value={stakeRaw} onChange={(e) => setStakeRaw(e.target.value)} />
                            </div>
                            <button type='button' className='w-full rounded-2xl bg-white px-4 py-4 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all hover:bg-white/90 disabled:opacity-50 disabled:pointer-events-none' disabled={!canBet || placingBet} onClick={() => setConfirmOpen(true)}>
                              {placingBet ? 'Processando...' : 'Confirmar Bilhete ->'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* History */}
                      <article className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
                        <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3'>Histórico de cotações</p>
                        <div className='max-h-48 space-y-1.5 overflow-auto pr-1'>
                          {(snapshot.history ?? []).slice().reverse().map((point) => (
                            <div key={`${point.at}-${point.leftOdd}`} className='flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-xs'>
                              <span className='text-white/30 tabular-nums'>{new Date(point.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                              <div className='flex gap-3'>
                                <span><span className='text-blue-400'>@</span> <strong>{point.leftOdd.toFixed(2)}</strong></span>
                                <span className='text-white/15'>/</span>
                                <span><span className='text-orange-400'>@</span> <strong>{point.rightOdd.toFixed(2)}</strong></span>
                              </div>
                              <span className='text-white/25 tabular-nums hidden sm:block'>R$ {formatMoney(point.leftPool + point.rightPool)}</span>
                            </div>
                          ))}
                        </div>
                      </article>
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

      {/* Confirm modal */}
      {confirmOpen && (
        <div className='fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4'>
          <div className='w-full max-w-md rounded-2xl border border-white/10 bg-[#101525] p-6 shadow-2xl'>
            <h3 className='text-xl font-bold'>Confirmar aposta?</h3>
            <p className='mt-3 text-sm text-white/85'>
              Valor: <span className='font-bold text-emerald-400'>R$ {formatMoney(stake)}</span> no{' '}
              <span className='font-bold'>{selectedSide?.label ?? 'lado selecionado'}</span>
            </p>
            <p className='mt-1 text-sm text-white/70'>Retorno potencial: <span className='font-semibold text-emerald-300'>R$ {formatMoney(expectedReturn)}</span></p>
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

function OddCard({ title, odd, pool, tickets, active, onClick, tone }: {
  title: string; odd?: number; pool?: number; tickets?: number; active: boolean; onClick: () => void; tone: 'blue' | 'orange';
}) {
  const isBlue = tone === 'blue';
  return (
    <button
      className={`group relative w-full overflow-hidden text-left transition-all duration-500 outline-none ${active ? 'scale-[1.02] shadow-2xl z-10' : 'hover:scale-[1.01] opacity-90 hover:opacity-100'}`}
      type='button' onClick={onClick}
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
