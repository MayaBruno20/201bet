'use client';

/**
 * Hub público do Armageddon (Fase 1).
 * - Live do YouTube embeddada (event.streamUrl).
 * - Hero cinematográfico + broadcast bar ao vivo.
 * - Chaveamento que mostra SÓ os embates já formados (ambos os pilotos definidos)
 *   ou já auditados — sem slots vazios das rodadas futuras. As baterias seguintes
 *   aparecem conforme as anteriores vão sendo auditadas.
 * A aposta reaproveita o fluxo existente via deep-link (/apostas?duelId=).
 */

import Link from 'next/link';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { BettingExperience } from '@/components/apostas/betting-board';
import { ArmageddonChampionShowcase } from '@/components/apostas/armageddon-champion-showcase';
import { CheckeredFlagIcon, CrownIcon, TargetIcon, BracketIcon, TrophyIcon } from '@/components/apostas/armageddon-icons';
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

type ArmaMatchup = {
  id: string;
  roundNumber: number;
  order: number;
  stage: 'FIRST_DRAW' | 'SECOND_DRAW' | null;
  bracketKey: string | null;
  isThirdPlace?: boolean;
  isFinal?: boolean;
  leftDriverName: string | null;
  rightDriverName: string | null;
  winnerSide: 'LEFT' | 'RIGHT' | null;
  marketOpen: boolean;
  duelId: string | null;
};
type ArmaEvent = {
  id: string;
  name: string;
  status: string;
  bracketType?: string;
  bannerUrl?: string | null;
  streamUrl?: string | null;
  eventId?: string | null;
  scheduledAt: string;
  endsAt?: string | null;
  matchups: ArmaMatchup[];
};

/** Só embates já formados (2 pilotos) ou já decididos entram na visão pública. */
const hasContent = (m: ArmaMatchup) => (!!m.leftDriverName && !!m.rightDriverName) || !!m.winnerSide;

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

function roundLabel(m: ArmaMatchup): string {
  if (m.isThirdPlace) return 'Disputa de 3º lugar';
  if (m.isFinal) return 'Grande Final';
  if (m.stage === 'SECOND_DRAW') {
    const map: Record<number, string> = { 1: 'Top 32', 2: 'Top 16', 3: 'Quartas', 4: 'Semifinal', 5: 'Final' };
    return map[m.roundNumber] ?? `Rodada ${m.roundNumber}`;
  }
  return `Rodada ${m.roundNumber}`;
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

export default function ArmageddonHubPage() {
  const [event, setEvent] = useState<ArmaEvent | null>(null);
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

  // Atualiza saldo + "Meus bilhetes" quando QUALQUER aposta é feita (modal ou carrinho
  // do BettingExperience disparam 'wallet:refresh').
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
      fetch(`${apiUrl}/armageddon`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : []))
        .then((data: ArmaEvent[]) => {
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

  // Chaveamento: agrupa por chave/fase → rodada, mas SÓ embates com conteúdo.
  const groups = useMemo(() => {
    const byKey = new Map<string, ArmaMatchup[]>();
    for (const m of event?.matchups ?? []) {
      if (!hasContent(m)) continue; // esconde slots vazios das rodadas futuras
      const key = m.stage === 'SECOND_DRAW' ? '2º Sorteio · Top 32' : m.bracketKey ? `Chave ${m.bracketKey}` : 'Embates';
      (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(m);
    }
    // Ordena as chaves em ordem alfabética (Chave A, B, C…); o "2º Sorteio · Top 32"
    // vem depois das chaves e qualquer outro grupo por último. Sem isto os grupos
    // seguiam a ordem de inserção dos dados — no mobile (1 coluna) ficava fora de ordem.
    const groupRank = (label: string) =>
      label.startsWith('Chave ')
        ? { tier: 0, key: label.slice(6) }
        : label.startsWith('2º Sorteio')
          ? { tier: 1, key: '' }
          : { tier: 2, key: label };

    return Array.from(byKey.entries())
      .map(([label, ms]) => {
        const byRound = new Map<number, ArmaMatchup[]>();
        for (const m of ms) (byRound.get(m.roundNumber) ?? byRound.set(m.roundNumber, []).get(m.roundNumber)!).push(m);
        const rounds = Array.from(byRound.entries())
          .map(([rn, list]) => ({ rn, label: roundLabel(list[0]), list: list.sort((a, b) => a.order - b.order) }))
          .sort((a, b) => a.rn - b.rn);
        return { label, rounds };
      })
      .sort((a, b) => {
        const ra = groupRank(a.label);
        const rb = groupRank(b.label);
        return ra.tier - rb.tier || ra.key.localeCompare(rb.key, 'pt-BR', { numeric: true });
      });
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
                <span className="hidden sm:inline"><b className="text-white">{settledCount}</b> auditados</span>
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
                <span className="bg-gradient-to-br from-[#ffd479] via-[#ffb028] to-[#ff8a2a] bg-clip-text text-transparent">{event.name}</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm sm:text-base text-white/55">
                O maior evento de arrancada NoPrep da América Latina. Assista à transmissão e aposte em tempo real — tudo num lugar só.
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
                    title="Transmissão ao vivo do Armageddon"
                    className="absolute inset-0 h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              </div>
            </section>
          )}

          {/* ── ÂNCORAS DE ACESSO RÁPIDO (foco nas Passadas + atalho pras outras modalidades) ── */}
          {/* ÚNICA barra fixa: gruda logo abaixo do MainNav (a broadcast rola junto) */}
          <div className="sticky z-30 border-b border-white/10 bg-[#0b0e18]/95 backdrop-blur-md" style={{ top: 'var(--app-shell-h, 64px)' }}>
            <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 sm:px-6 lg:px-8 py-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span className="mr-1 hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30 sm:inline">Ir para</span>
              <a href="#ao-vivo" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[linear-gradient(180deg,#ffc55a,#ff8a2a)] px-4 py-1.5 text-[12.5px] font-bold text-[#1a1305] shadow-[0_8px_22px_-10px_rgba(255,138,42,0.7)]">
                <CheckeredFlagIcon size={15} stroke={2} /> Passadas
              </a>
              <a href="#campeonato" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-4 py-1.5 text-[12.5px] font-semibold text-white/80 transition hover:bg-white/10">
                <CrownIcon size={15} /> Campeão
              </a>
              <a href="#resorteio" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-4 py-1.5 text-[12.5px] font-semibold text-white/80 transition hover:bg-white/10">
                <TargetIcon size={15} /> Resorteio
              </a>
              <a href="#chaveamento" className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.05] px-4 py-1.5 text-[12.5px] font-semibold text-white/70 transition hover:bg-white/10">
                <BracketIcon size={15} /> Chaveamento
              </a>
            </div>
          </div>

          {/* ── APOSTAS AO VIVO — PASSADAS (foco principal) ── */}
          <section id="ao-vivo" className="pt-6 scroll-mt-28">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full bg-[#ffb028]" />
                <h2 className="text-lg font-bold">Passadas ao vivo</h2>
              </div>
              <p className="mt-1 text-[13px] text-white/45">O coração do Armageddon — escolha os pilotos e monte seu bilhete (multi-aposta). Cotação dinâmica.</p>
            </div>
            <BettingExperience lockedEventId={event.eventId ?? undefined} hideHeader hideFeatured passadasOnly hideMyBets />
          </section>

          {/* ── MULTI-MERCADOS DO CAMPEONATO (Campeão Geral + Resorteio) ── */}
          {event.eventId && <ArmageddonChampionShowcase eventId={event.eventId} />}

          {/* ── CHAVEAMENTO (só o que já foi formado/auditado) ── */}
          <section id="chaveamento" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16 scroll-mt-28">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">Chaveamento</h2>
              <span className="text-[12px] text-white/40">As próximas baterias aparecem conforme são auditadas</span>
            </div>
            {groups.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/45 text-sm">
                O chaveamento começa assim que os primeiros embates forem definidos.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {groups.map((g) => (
                  <div key={g.label} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="font-display text-sm font-bold text-white/80 mb-3">{g.label}</div>
                    <div className="space-y-3">
                      {g.rounds.map((r) => (
                        <div key={r.rn}>
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35 mb-1.5">
                            {r.label} <span className="text-white/20">· {r.list.filter((m) => m.winnerSide).length}/{r.list.length}</span>
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

function MatchupRow({ m, onApostar }: { m: ArmaMatchup; onApostar: (duelId: string) => void }) {
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
      <h1 className="text-2xl font-bold">Nenhum Armageddon ao vivo agora</h1>
      <p className="mt-2 text-white/50">O maior evento de arrancada NoPrep da América Latina volta em breve. Enquanto isso, há outras corridas rolando.</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/apostas" className="rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black transition hover:scale-[1.03]">Ver apostas</Link>
        <Link href="/eventos" className="rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10">Próximos eventos</Link>
      </div>
    </div>
  );
}
