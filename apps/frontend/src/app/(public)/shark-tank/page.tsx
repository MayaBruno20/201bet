'use client';

/**
 * Hub público do Shark Tank (mata-mata em chaves).
 * - Live do YouTube embeddada (event.streamUrl).
 * - Hero cinematográfico + broadcast bar ao vivo.
 * - Chaveamento em 4 chaves (A–D) de 8 pilotos cada — mostra SÓ os embates já
 *   formados (ambos os pilotos definidos) ou já auditados; as baterias seguintes
 *   aparecem conforme as anteriores são decididas. Cada chave: Quartas (4 duelos)
 *   → Semifinal (2) → Final da chave (1).
 * - "Fase Final": os 4 desafios do 2º sorteio (finalista da chave × piloto Top-20).
 * A aposta reaproveita EXATAMENTE o fluxo do Armageddon: snapshot ao vivo do
 * duelo → FeaturedDuelBetModal, sem sair da página.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { CheckeredFlagIcon, BracketIcon, TargetIcon, TrophyIcon } from '@/components/apostas/armageddon-icons';
import { getPublicApiUrl } from '@/lib/env-public';
import { apiFetch } from '@/lib/api-request';
import { FeaturedDuelBetModal } from '@/components/apostas/featured-duel-bet-modal';
import type { FeaturedCustomDuel } from '@/components/apostas/featured-duels-banner';
import { MyBetsHistory, type BetHistoryItem, type BetHistoryStatus } from '@/components/apostas/my-bets-history';
import type { MarketSnapshot } from '@/types/market';

const apiUrl = getPublicApiUrl();

/** Resolve banner relativo (/api/images/:id) para URL absoluta do backend. */
function resolveBanner(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:')) return url;
  const origin = apiUrl.replace(/\/api\/?$/, '');
  return url.startsWith('/') ? `${origin}${url}` : `${origin}/${url}`;
}

type SharkMatchup = {
  id: string;
  roundNumber: number;
  order: number;
  stage: 'FIRST_DRAW' | 'SECOND_DRAW' | null;
  bracketKey: string | null;
  isThirdPlace?: boolean;
  isFinal?: boolean;
  leftDriverName: string | null;
  rightDriverName: string | null;
  leftDriverId?: string | null;
  rightDriverId?: string | null;
  winnerSide: 'LEFT' | 'RIGHT' | null;
  marketOpen: boolean;
  duelId: string | null;
};
type SharkEvent = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  bracketType?: string;
  bannerUrl?: string | null;
  streamUrl?: string | null;
  scheduledAt: string;
  roster?: unknown[];
  matchups: SharkMatchup[];
};

/** Só embates já formados (2 pilotos) ou já decididos entram na visão pública. */
const hasContent = (m: SharkMatchup) => (!!m.leftDriverName && !!m.rightDriverName) || !!m.winnerSide;

type MeResponse = { wallet?: { balance: number | string; currency?: string } | null } | null;
type RawBet = {
  id: string;
  status: string;
  stake: number | string;
  potentialWin: number | string;
  createdAt: string;
  items?: Array<{ oddAtPlacement?: number; eventName?: string; marketName?: string; oddLabel?: string }>;
};

/** Monta um FeaturedCustomDuel (formato do modal de aposta) a partir do snapshot ao
 *  vivo do duelo — usado pra apostar direto pelo chaveamento, sem sair da página. */
function snapshotToFeaturedDuel(snap: MarketSnapshot): FeaturedCustomDuel {
  const allowed = ['SCHEDULED', 'BOOKING_OPEN', 'BOOKING_CLOSED', 'FINISHED', 'CANCELED'];
  const status = (allowed.includes(snap.status) ? snap.status : 'BOOKING_OPEN') as FeaturedCustomDuel['status'];
  return {
    id: snap.duelId,
    eventId: snap.eventId,
    eventName: snap.eventName,
    title: `${snap.duel.left.label} × ${snap.duel.right.label}`,
    bannerUrl: null,
    startsAt: snap.eventStartAt,
    bookingCloseAt: snap.eventStartAt,
    status,
    leftCar: { label: snap.duel.left.label, photoUrl: snap.duel.left.photoUrl ?? null, driverName: '' },
    rightCar: { label: snap.duel.right.label, photoUrl: snap.duel.right.photoUrl ?? null, driverName: '' },
    market: {
      id: '',
      odds: [
        { id: snap.duel.left.id, label: snap.duel.left.label, value: snap.duel.left.odd },
        { id: snap.duel.right.id, label: snap.duel.right.label, value: snap.duel.right.odd },
      ],
    },
    pool: {
      left: snap.duel.left.pool,
      right: snap.duel.right.pool,
      tickets: (snap.duel.left.tickets ?? 0) + (snap.duel.right.tickets ?? 0),
    },
  };
}

/** Rótulo da rodada dentro de uma chave de 8 pilotos (4 → 2 → 1). */
const CHAVE_ROUND_LABEL: Record<number, string> = { 1: 'Quartas de final', 2: 'Semifinal', 3: 'Final da chave' };
function chaveRoundLabel(rn: number): string {
  return CHAVE_ROUND_LABEL[rn] ?? `Rodada ${rn}`;
}

/** Converte um link do YouTube (watch / youtu.be / live / embed) para URL de embed. */
function youtubeEmbed(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    let id = '';
    if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
    else if (u.pathname.startsWith('/live/')) id = u.pathname.split('/live/')[1] ?? '';
    else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/embed/')[1] ?? '';
    else id = u.searchParams.get('v') ?? '';
    id = (id || '').split('/')[0].split('?')[0];
    if (!id) return null;
    return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&rel=0&playsinline=1`;
  } catch {
    return null;
  }
}

export default function SharkTankHubPage() {
  const [event, setEvent] = useState<SharkEvent | null>(null);
  const [loading, setLoading] = useState(true);

  // Conta do usuário (saldo + histórico) — pra apostar pelo chaveamento e mostrar
  // "Meus bilhetes" no fim da página.
  const [me, setMe] = useState<MeResponse>(null);
  const [myBets, setMyBets] = useState<RawBet[]>([]);
  // Duelo selecionado pra apostar via modal (vindo do chaveamento).
  const [betDuel, setBetDuel] = useState<FeaturedCustomDuel | null>(null);
  const [betSnapshot, setBetSnapshot] = useState<MarketSnapshot | null>(null);

  const refreshAccount = useCallback(() => {
    apiFetch(`${apiUrl}/auth/me`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d as MeResponse))
      .catch(() => undefined);
    apiFetch(`${apiUrl}/auth/my-bets`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setMyBets(Array.isArray(d) ? (d as RawBet[]) : []))
      .catch(() => undefined);
  }, []);
  useEffect(() => { refreshAccount(); }, [refreshAccount]);

  // Atualiza saldo + "Meus bilhetes" quando QUALQUER aposta é feita (o modal dispara
  // 'wallet:refresh').
  useEffect(() => {
    const onRefresh = () => refreshAccount();
    window.addEventListener('wallet:refresh', onRefresh);
    return () => window.removeEventListener('wallet:refresh', onRefresh);
  }, [refreshAccount]);

  const historyItems: BetHistoryItem[] = useMemo(() => myBets.map((b) => {
    const item = b.items?.[0];
    const status: BetHistoryStatus = b.status === 'WON' ? 'WON'
      : b.status === 'LOST' ? 'LOST'
      : (b.status === 'CANCELED' || b.status === 'REFUNDED') ? 'CANCELED'
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
  }), [myBets]);

  // Abre o modal de aposta pra um duelo do chaveamento (busca o snapshot ao vivo).
  const openBet = useCallback((duelId: string) => {
    fetch(`${apiUrl}/market/snapshot?duelId=${encodeURIComponent(duelId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => {
        const t = text.trim();
        if (!t || t === 'null') return;
        let snap: MarketSnapshot | null = null;
        try { snap = JSON.parse(t) as MarketSnapshot; } catch { return; }
        if (!snap?.duel?.left || !snap?.duel?.right) return;
        setBetSnapshot(snap);
        setBetDuel(snapshotToFeaturedDuel(snap));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch(`${apiUrl}/shark-tank`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: SharkEvent[]) => {
          if (!alive) return;
          setEvent(Array.isArray(data) ? data.find((e) => e.status === 'IN_PROGRESS') ?? null : null);
          setLoading(false);
        })
        .catch(() => { if (alive) setLoading(false); });
    };
    load();
    const id = setInterval(load, 20_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const live = useMemo(
    () => (event?.matchups ?? []).filter((m) => m.marketOpen && !m.winnerSide && hasContent(m)),
    [event],
  );
  const settledCount = useMemo(() => (event?.matchups ?? []).filter((m) => m.winnerSide).length, [event]);
  const embed = youtubeEmbed(event?.streamUrl);

  // Chaveamento: 4 chaves (A–D) por rodada + a "Fase Final" (2º sorteio). Só embates
  // com conteúdo (2 pilotos definidos ou já auditados) — esconde slots futuros vazios.
  const groups = useMemo(() => {
    const first = new Map<string, SharkMatchup[]>(); // bracketKey → FIRST_DRAW
    const finals: SharkMatchup[] = []; // SECOND_DRAW
    for (const m of event?.matchups ?? []) {
      if (!hasContent(m)) continue;
      if (m.stage === 'SECOND_DRAW') { finals.push(m); continue; }
      const key = m.bracketKey ?? '?';
      (first.get(key) ?? first.set(key, []).get(key)!).push(m);
    }

    // Chaves em ordem alfabética (A, B, C, D); cada chave subdividida por rodada.
    const chaveGroups = Array.from(first.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }))
      .map(([key, ms]) => {
        const byRound = new Map<number, SharkMatchup[]>();
        for (const m of ms) (byRound.get(m.roundNumber) ?? byRound.set(m.roundNumber, []).get(m.roundNumber)!).push(m);
        const rounds = Array.from(byRound.entries())
          .sort(([a], [b]) => a - b)
          .map(([rn, list]) => ({
            key: `r${rn}`,
            label: chaveRoundLabel(rn),
            showCount: true,
            list: list.sort((a, b) => a.order - b.order),
          }));
        return { label: `Chave ${key}`, kind: 'chave' as const, rounds };
      });

    // Fase Final: cada desafio do 2º sorteio como um bloco "Desafio {order}".
    const finalGroup = finals.length
      ? [{
          label: 'Fase Final',
          kind: 'final' as const,
          rounds: finals
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((m) => ({ key: `d${m.id}`, label: `Desafio ${m.order}`, showCount: false, list: [m] })),
        }]
      : [];

    return [...chaveGroups, ...finalGroup];
  }, [event]);

  return (
    <main className="min-h-screen bg-[#090b11] text-white">
      <MainNav />

      {loading ? (
        <div className="mx-auto max-w-7xl px-4 py-24 text-center text-white/40">Carregando…</div>
      ) : !event ? (
        <NoEventState />
      ) : (
        <>
          {/* ── BROADCAST BAR ── (rola normal com a página — não fica fixa) */}
          <div className="border-b border-white/10 bg-[#0b0e18]/90 backdrop-blur-md">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8 py-2 text-[12px]">
              <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-[0.16em] text-red-300">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" /></span>
                Ao vivo
              </span>
              <span className="font-semibold truncate">{event.name}</span>
              <span className="ml-auto flex items-center gap-4 text-white/55 whitespace-nowrap">
                <span><b className="text-red-400">{live.length}</b> ao vivo</span>
                <span className="hidden sm:inline"><b className="text-white">{settledCount}</b> decididos</span>
              </span>
            </div>
          </div>

          {/* ── HERO ── */}
          <section className="relative overflow-hidden border-b border-white/5">
            {event.bannerUrl && (
              <div className="absolute inset-0 -z-10 bg-cover bg-center opacity-25" style={{ backgroundImage: `url(${resolveBanner(event.bannerUrl)})` }} />
            )}
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#090b11]/70 via-[#090b11]/85 to-[#090b11]" />
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
              <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight">
                <span className="bg-gradient-to-br from-[#ffd479] via-[#ffb028] to-[#ff8a2a] bg-clip-text text-transparent">Shark Tank</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm sm:text-base text-white/55">
                {event.description
                  || 'O mata-mata de arrancada em 4 chaves. Assista à transmissão e aposte em cada duelo do chaveamento em tempo real — tudo num lugar só.'}
              </p>
            </div>
          </section>

          {/* ── LIVE STREAM (YouTube) ── */}
          {embed && (
            <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8">
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_0_60px_-15px_rgba(255,176,40,0.25)]">
                <div className="relative w-full" style={{ aspectRatio: '16 / 9' }}>
                  <iframe
                    src={embed}
                    title="Transmissão ao vivo do Shark Tank"
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              </div>
            </section>
          )}

          {/* ── CHAVEAMENTO (chaves A–D + Fase Final; só o que já foi formado/auditado) ── */}
          <section id="chaveamento" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 scroll-mt-28">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#ffb028]/12 text-[#ffb028]"><BracketIcon size={16} /></span>
                <h2 className="text-lg font-bold">Chaveamento</h2>
              </div>
              <span className="text-[12px] text-white/40">As próximas baterias aparecem conforme são auditadas</span>
            </div>
            {groups.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/45 text-sm">
                O chaveamento começa assim que os primeiros embates forem definidos.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {groups.map((g) => (
                  <div key={g.label} className={`rounded-2xl border bg-white/[0.02] p-4 ${g.kind === 'final' ? 'border-[#4cc4ff]/25' : 'border-white/10'}`}>
                    <div className="mb-3 flex items-center gap-2 font-display text-sm font-bold text-white/80">
                      {g.kind === 'final' && <TargetIcon size={15} className="text-[#4cc4ff]" />}
                      {g.label}
                    </div>
                    <div className="space-y-3">
                      {g.rounds.map((r) => (
                        <div key={r.key}>
                          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
                            {r.label}
                            {r.showCount && (
                              <span className="text-white/20"> · {r.list.filter((m) => m.winnerSide).length}/{r.list.length}</span>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            {r.list.map((m) => <MatchupRow key={m.id} m={m} onApostar={openBet} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── MEUS BILHETES (no fim da página) ── */}
          {me && (
            <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20">
              <MyBetsHistory bets={historyItems} />
            </section>
          )}
        </>
      )}

      {/* Modal de aposta direta pelo chaveamento (não navega pra /apostas) */}
      {betDuel && (
        <FeaturedDuelBetModal
          duel={betDuel}
          balance={me?.wallet ? Number(me.wallet.balance) : null}
          isLoggedIn={!!me}
          minBet={10}
          snapshot={betSnapshot}
          onClose={() => { setBetDuel(null); setBetSnapshot(null); }}
          onBetPlaced={({ newBalance }) => {
            setMe((prev) => (prev ? { ...prev, wallet: { balance: newBalance, currency: prev.wallet?.currency ?? 'BRL' } } : prev));
            if (typeof window !== 'undefined') window.dispatchEvent(new Event('wallet:refresh'));
            refreshAccount();
            setBetDuel(null);
            setBetSnapshot(null);
          }}
        />
      )}
    </main>
  );
}

function MatchupRow({ m, onApostar }: { m: SharkMatchup; onApostar: (duelId: string) => void }) {
  const settled = !!m.winnerSide;
  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px]"
      style={{ background: settled ? 'rgba(16,185,129,0.06)' : m.marketOpen ? 'rgba(255,176,40,0.06)' : 'transparent' }}>
      <span className={`flex flex-1 items-center gap-1.5 truncate ${m.winnerSide === 'LEFT' ? 'font-bold text-emerald-300' : ''}`}>
        {m.winnerSide === 'LEFT' && <TrophyIcon size={13} className="shrink-0 text-emerald-300" />}
        <span className="truncate">{m.leftDriverName ?? '—'}</span>
      </span>
      <span className="text-white/25 text-[10px]">vs</span>
      <span className={`flex flex-1 items-center justify-end gap-1.5 truncate text-right ${m.winnerSide === 'RIGHT' ? 'font-bold text-emerald-300' : ''}`}>
        <span className="truncate">{m.rightDriverName ?? '—'}</span>
        {m.winnerSide === 'RIGHT' && <TrophyIcon size={13} className="shrink-0 text-emerald-300" />}
      </span>
      {m.marketOpen && !settled && m.duelId && (
        <button type="button" onClick={() => onApostar(m.duelId!)} className="shrink-0 rounded-md bg-[#ffb028]/15 px-2 py-0.5 text-[10px] font-bold text-[#ffb028] transition hover:bg-[#ffb028]/25">apostar</button>
      )}
    </div>
  );
}

function NoEventState() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-[#ffb028]/25 bg-[#ffb028]/10 text-[#ffb028]">
        <CheckeredFlagIcon size={30} />
      </div>
      <h1 className="text-2xl font-bold">Nenhum Shark Tank ao vivo agora</h1>
      <p className="mt-2 text-white/50">O mata-mata de arrancada volta em breve. Enquanto isso, há outras corridas rolando.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/apostas" className="rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black transition hover:scale-[1.03]">Ver apostas</Link>
        <Link href="/eventos" className="rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10">Próximos eventos</Link>
      </div>
    </div>
  );
}
