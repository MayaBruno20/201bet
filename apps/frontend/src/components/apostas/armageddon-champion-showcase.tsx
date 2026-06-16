'use client';

/**
 * 201bet · /armageddon — Vitrine "Aposte no Campeão".
 *
 * Mercado de Campeão Geral (top 1 do Armageddon) e, quando existir, o mercado
 * de Classificados ao Resorteio. Ambos rodam no mesmo motor de apostas dos
 * multi-mercados. As passadas continuam sendo o foco — esta vitrine é o
 * destino das âncoras de acesso rápido da página.
 *
 * UX: leaderboard com BUSCA (são até 144 pilotos — essencial no celular), e a
 * aposta abre num MODAL centralizado (mesmo padrão do modal das passadas), não
 * mais inline. O prêmio é o pote dividido entre quem acerta; o retorno estimado
 * só aparece quando já há apostas (pote > 0).
 */

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';
import { Loader2, Search, Check, X, Lock } from 'lucide-react';
import { CrownIcon, TargetIcon, TrophyIcon } from '@/components/apostas/armageddon-icons';
import { apiFetch, parseApiErrorMessage } from '@/lib/api-request';
import { getPublicApiUrl, getPublicWsUrl } from '@/lib/env-public';
import type { MultiRunnerSnapshot } from '@/types/market';

const apiUrl = getPublicApiUrl();
const wsUrl = getPublicWsUrl();

const QUICK_AMOUNTS = [10, 25, 50, 100];

type Me = { id: string; name: string; wallet?: { balance: number | string } };
type Runner = MultiRunnerSnapshot['runners'][number];

const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBRLShort = (n: number) =>
  n >= 1000 ? `R$ ${(n / 1000).toFixed(1).replace('.', ',')}k` : fmtBRL(n);

/* Medalhas do leaderboard (só fazem sentido quando há apostas). */
const RANK_STYLE = [
  'bg-[linear-gradient(160deg,#ffd479,#b8860b)] text-[#1a1305]',
  'bg-[linear-gradient(160deg,#e8e8f0,#8a8a98)] text-[#15151c]',
  'bg-[linear-gradient(160deg,#e0a36a,#8a5a2b)] text-[#1d1208]',
];

export function ArmageddonChampionShowcase({ eventId }: { eventId: string }) {
  const [markets, setMarkets] = React.useState<Record<string, MultiRunnerSnapshot>>({});
  const [me, setMe] = React.useState<Me | null>(null);
  const [minBet, setMinBet] = React.useState(10);
  const [loaded, setLoaded] = React.useState(false);
  const [bet, setBet] = React.useState<{ market: MultiRunnerSnapshot; oddId: string } | null>(null);

  const absorb = React.useCallback((list: MultiRunnerSnapshot[]) => {
    setMarkets((prev) => {
      const next = { ...prev };
      for (const s of list) if (s.eventId === eventId) next[s.marketId] = s;
      return next;
    });
  }, [eventId]);

  const refetch = React.useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/market/multi-runner/snapshots`, { cache: 'no-store' });
      if (res.ok) absorb((await res.json()) as MultiRunnerSnapshot[]);
    } catch { /* silencioso — WS cobre */ }
    setLoaded(true);
  }, [absorb]);

  React.useEffect(() => {
    void refetch();
    void (async () => {
      try {
        const r = await apiFetch(`${apiUrl}/auth/me`, { cache: 'no-store' });
        if (r.ok) setMe((await r.json()) as Me);
      } catch { /* deslogado */ }
    })();
    void (async () => {
      try {
        const r = await fetch(`${apiUrl}/market/config`);
        const cfg = r.ok ? await r.json() : null;
        if (typeof cfg?.minBetAmount === 'number' && cfg.minBetAmount > 0) setMinBet(cfg.minBetAmount);
      } catch { /* default 10 */ }
    })();
  }, [refetch]);

  React.useEffect(() => {
    const socket: Socket = io(wsUrl, { transports: ['websocket'] });
    socket.on('market:multi-runner:update', (payload: MultiRunnerSnapshot) => {
      if (payload.eventId === eventId) setMarkets((prev) => ({ ...prev, [payload.marketId]: payload }));
    });
    socket.on('market:settled', () => {
      void refetch();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('wallet:refresh'));
    });
    return () => { socket.disconnect(); };
  }, [eventId, refetch]);

  // Só exibimos Campeão (WINNER) e Classificados ao Resorteio (QUALIFY).
  const champion = React.useMemo(
    () => Object.values(markets).filter((m) => m.marketType === 'WINNER').sort((a, b) => b.totalPool - a.totalPool),
    [markets],
  );
  const qualify = React.useMemo(
    () => Object.values(markets).filter((m) => (m.marketType as string) === 'QUALIFY').sort((a, b) => b.totalPool - a.totalPool),
    [markets],
  );

  const balance = me?.wallet ? Number(me.wallet.balance) : null;

  const onBetPlaced = (snapshot: MultiRunnerSnapshot, newBalance: number) => {
    setMarkets((prev) => ({ ...prev, [snapshot.marketId]: snapshot }));
    setMe((p) => (p ? { ...p, wallet: { balance: newBalance } } : p));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('wallet:refresh'));
  };

  if (!loaded || (champion.length === 0 && qualify.length === 0)) return null;

  const selectedRunner = bet ? bet.market.runners.find((r) => r.oddId === bet.oddId) ?? null : null;
  const liveBetMarket = bet ? markets[bet.market.marketId] ?? bet.market : null;

  return (
    <section id="campeonato" className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 scroll-mt-24">
      <style>{`
        @keyframes arma-foil { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        @keyframes arma-lines { 0% { background-position: 0 0; } 100% { background-position: 56px 0; } }
        @keyframes arma-glow { 0%,100% { opacity: .5; } 50% { opacity: 1; } }
        .arma-foil {
          background: linear-gradient(110deg, #8a5a13 0%, #ffd479 22%, #fff3c4 38%, #ffb028 52%, #8a5a13 70%, #ffd479 90%);
          background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: arma-foil 6s linear infinite;
        }
        .arma-lines { background-image: repeating-linear-gradient(115deg, rgba(255,176,40,0.07) 0 2px, transparent 2px 28px); animation: arma-lines 3.2s linear infinite; }
        .arma-foil-blue {
          background: linear-gradient(110deg, #0e3a5a 0%, #7cd0ff 22%, #dff3ff 38%, #4cc4ff 52%, #0e3a5a 70%, #7cd0ff 90%);
          background-size: 200% auto; -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: arma-foil 6s linear infinite;
        }
        .arma-lines-blue { background-image: repeating-linear-gradient(115deg, rgba(76,196,255,0.08) 0 2px, transparent 2px 28px); animation: arma-lines 3.2s linear infinite; }
      `}</style>

      {/* Marquee do campeonato */}
      <div className="relative overflow-hidden rounded-3xl border border-[#ffb028]/25 bg-[#0c0e16]">
        <div className="absolute inset-0 arma-lines" aria-hidden />
        <div className="absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-[100%] bg-[#ffb028]/10 blur-3xl" aria-hidden style={{ animation: 'arma-glow 4s ease-in-out infinite' }} />
        <div className="relative flex flex-col gap-3 p-5 sm:p-7">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#ffb028]/30 bg-[#ffb028]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#ffd479]">
            <TrophyIcon size={13} /> Mercados do campeonato
          </div>
          <h2 className="arma-foil font-display text-3xl font-extrabold tracking-tight sm:text-5xl">Aposte no Campeão</h2>
          <p className="max-w-xl text-[13px] leading-relaxed text-white/45">
            Escolha quem leva o título do Armageddon. O prêmio é o pote total dividido entre quem acertar,
            proporcional ao valor apostado — quem acerta nunca recebe menos que o valor apostado.
          </p>
        </div>
      </div>

      {/* Mercado de Campeão */}
      <div className="mt-4 space-y-4">
        {champion.map((m) => (
          <MarketBoard key={m.marketId} market={markets[m.marketId] ?? m} accent="#ffb028"
            subtitle="Campeão Geral · top 1 do Armageddon" onPick={(oddId) => setBet({ market: m, oddId })} />
        ))}
      </div>

      {/* Mercado de Classificados ao Resorteio (aparece quando criado no admin) */}
      {qualify.length > 0 && (
        <div id="resorteio" className="mt-8 space-y-4 scroll-mt-24">
          {/* Banner do Resorteio (pegada azul, espelha o "Aposte no Campeão") */}
          <div className="relative overflow-hidden rounded-3xl border border-[#4cc4ff]/25 bg-[#0c0e16]">
            <div className="absolute inset-0 arma-lines-blue" aria-hidden />
            <div className="absolute -top-24 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-[100%] bg-[#4cc4ff]/10 blur-3xl" aria-hidden style={{ animation: 'arma-glow 4s ease-in-out infinite' }} />
            <div className="relative flex flex-col gap-3 p-5 sm:p-7">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#4cc4ff]/30 bg-[#4cc4ff]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#9fe0ff]">
                <TargetIcon size={13} /> Mercados do resorteio
              </div>
              <h2 className="arma-foil-blue font-display text-3xl font-extrabold tracking-tight sm:text-5xl">Aposte no Resorteio</h2>
              <p className="max-w-xl text-[13px] leading-relaxed text-white/45">
                Aposte em quem se classifica para o 2º sorteio (Top 32). É um mercado de múltiplos vencedores —
                todos que apostarem num piloto classificado dividem o pote, proporcional ao valor apostado.
                Quem acerta nunca recebe menos que o valor apostado.
              </p>
            </div>
          </div>

          {qualify.map((m) => (
            <MarketBoard key={m.marketId} market={markets[m.marketId] ?? m} accent="#4cc4ff"
              subtitle="Classificados ao Resorteio · 2ª etapa" onPick={(oddId) => setBet({ market: m, oddId })} />
          ))}
        </div>
      )}

      {bet && selectedRunner && liveBetMarket && (
        <ChampionBetModal
          market={liveBetMarket}
          runner={liveBetMarket.runners.find((r) => r.oddId === bet.oddId) ?? selectedRunner}
          minBet={minBet}
          balance={balance}
          isLoggedIn={!!me}
          onClose={() => setBet(null)}
          onPlaced={onBetPlaced}
        />
      )}
    </section>
  );
}

/* ───────────────────────── Board de um mercado ───────────────────────── */

function MarketBoard({ market, accent, subtitle, onPick }: {
  market: MultiRunnerSnapshot;
  accent: string;
  subtitle: string;
  onPick: (oddId: string) => void;
}) {
  const [query, setQuery] = React.useState('');
  const open = market.status === 'OPEN';
  const paused = market.status === 'SUSPENDED';
  const accentSoft = `${accent}1f`;
  const HeaderIcon = market.marketType === 'QUALIFY' ? TargetIcon : CrownIcon;

  const sorted = React.useMemo(
    () => [...market.runners].sort((a, b) => b.pool - a.pool || a.label.localeCompare(b.label, 'pt-BR')),
    [market.runners],
  );
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((r) => r.label.toLowerCase().includes(q)) : sorted;
  }, [sorted, query]);
  const leaderPool = sorted[0]?.pool ?? 0;
  const withBets = sorted.filter((r) => r.pool > 0).length;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0e1118]"
      style={{ boxShadow: `0 0 70px -28px ${accent}59` }}>
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: accentSoft, color: accent }}>
            <HeaderIcon size={17} />
          </span>
          <div className="min-w-0">
            <div className="truncate font-display text-[15px] font-bold text-white">{market.marketName}</div>
            <div className="truncate text-[11px] text-white/40">{subtitle}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">Pote</div>
            <div className="font-mono text-[15px] font-bold tabular-nums" style={{ color: accent }}>{fmtBRLShort(market.totalPool)}</div>
          </div>
          {paused && <span className="rounded-md bg-amber-400/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">pausado</span>}
        </div>
      </div>

      {/* Busca — essencial com 144 pilotos no celular */}
      <div className="border-b border-white/[0.05] px-4 py-2.5 sm:px-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar entre ${market.runners.length} pilotos…`}
            className="h-10 w-full rounded-xl border border-white/10 bg-[#0b0e18] pl-9 pr-9 text-[13.5px] text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-white/30">
          <span>{filtered.length} de {market.runners.length} pilotos</span>
          <span>{withBets > 0 ? `${withBets} com apostas` : 'seja o primeiro a apostar'}</span>
        </div>
      </div>

      {/* Leaderboard rolável */}
      <ul className="max-h-[420px] divide-y divide-white/[0.04] overflow-y-auto overscroll-contain">
        {filtered.map((r) => {
          const rank = sorted.indexOf(r);
          const barW = leaderPool > 0 ? Math.max(r.pool / leaderPool, r.pool > 0 ? 0.06 : 0) : 0;
          const hasOdd = r.pool > 0 && r.odd > 0;
          return (
            <li key={r.oddId}>
              <button
                type="button" disabled={!open} onClick={() => onPick(r.oddId)}
                className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.03] disabled:cursor-default disabled:opacity-60 sm:px-5"
              >
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md font-mono text-[11px] font-extrabold ${rank < 3 && r.pool > 0 ? RANK_STYLE[rank] : 'bg-white/[0.05] text-white/35'}`}>
                  {rank + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold text-white/85">{r.label}</div>
                  <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-white/[0.05]">
                    <div className="h-full rounded-full transition-[width] duration-700"
                      style={{ width: `${barW * 100}%`, background: `linear-gradient(90deg, ${accent}55, ${accent})`, boxShadow: rank === 0 && r.pool > 0 ? `0 0 12px ${accent}88` : undefined }} />
                  </div>
                  <div className="mt-0.5 flex gap-2 font-mono text-[10.5px] tabular-nums text-white/35">
                    <span>{fmtBRLShort(r.pool)}</span>
                    <span className="text-white/15">·</span>
                    <span>{r.tickets} {r.tickets === 1 ? 'aposta' : 'apostas'}</span>
                    {r.pool > 0 && <><span className="text-white/15">·</span><span>{r.poolShare.toFixed(0)}%</span></>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {hasOdd ? (
                    <>
                      <div className="font-mono text-lg font-extrabold tabular-nums text-white transition group-hover:brightness-110" style={{ color: accent }}>
                        {r.odd.toFixed(2)}<span className="text-[12px] opacity-70">x</span>
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-white/30">cotação agora</div>
                    </>
                  ) : (
                    <span className="rounded-lg border border-dashed px-2 py-1 text-[10px] font-semibold" style={{ borderColor: `${accent}55`, color: accent }}>
                      {open ? 'apostar' : '—'}
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-5 py-8 text-center text-[13px] text-white/40">Nenhum piloto encontrado para “{query}”.</li>
        )}
      </ul>

      {paused && (
        <div className="border-t border-white/[0.06] bg-amber-400/[0.06] px-4 py-2.5 text-center text-[12px] font-semibold text-amber-300/90">
          Mercado pausado pela organização — as apostas voltam em instantes.
        </div>
      )}
    </div>
  );
}

/* ───────────────────── Modal de aposta (padrão das passadas) ───────────────────── */

function ChampionBetModal({ market, runner, minBet, balance, isLoggedIn, onClose, onPlaced }: {
  market: MultiRunnerSnapshot;
  runner: Runner;
  minBet: number;
  balance: number | null;
  isLoggedIn: boolean;
  onClose: () => void;
  onPlaced: (snapshot: MultiRunnerSnapshot, newBalance: number) => void;
}) {
  const [stake, setStake] = React.useState<number>(minBet);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const open = market.status === 'OPEN';
  // Retorno estimado SÓ quando já há pote e cotação real para o piloto.
  const hasReturn = market.totalPool > 0 && runner.odd > 0;
  const potentialWin = hasReturn ? stake * runner.odd : 0;

  const submit = async () => {
    if (!isLoggedIn) { window.location.href = '/login'; return; }
    if (!stake || stake < minBet) { setError(`Aposta mínima é ${fmtBRL(minBet)}.`); return; }
    if (balance != null && stake > balance) { setError('Saldo insuficiente.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`${apiUrl}/market/multi-runner/bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketId: market.marketId, oddId: runner.oddId, amount: stake }),
      });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(parseApiErrorMessage(text, `Erro ${res.status}`));
      }
      const data = await res.json() as { snapshot: MultiRunnerSnapshot; wallet: { balance: number } };
      onPlaced(data.snapshot, data.wallet.balance);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao enviar aposta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl border border-amber-500/30 bg-[#0c1020] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.8)]"
        onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="relative overflow-hidden rounded-t-2xl border-b border-white/[0.06] bg-gradient-to-br from-[#1c1409] to-[#101525] p-5">
          <button type="button" onClick={onClose}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/40 text-white/80 backdrop-blur transition hover:bg-black/60 hover:text-white">
            <X className="h-4 w-4" />
          </button>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">
            {market.marketType === 'QUALIFY' ? <TargetIcon size={11} /> : <CrownIcon size={11} />} {market.marketName}
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold leading-tight text-white">{runner.label}</h2>
          <div className="mt-1 flex flex-wrap gap-2 font-mono text-[11px] text-white/45">
            <span>Pote {fmtBRLShort(market.totalPool)}</span>
            {runner.pool > 0 && <><span className="text-white/15">·</span><span>{runner.poolShare.toFixed(0)}% das apostas neste piloto</span></>}
            <span className="text-white/15">·</span>
            <span>{runner.tickets} {runner.tickets === 1 ? 'aposta' : 'apostas'}</span>
          </div>
        </div>

        <div className="p-5">
          {/* Cotação atual (só quando há pote/odds) */}
          {hasReturn && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
              <span className="text-[12px] text-white/45">Cotação agora</span>
              <span className="font-mono text-xl font-bold tabular-nums text-amber-300">{runner.odd.toFixed(2)}x</span>
            </div>
          )}

          <label className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Valor da aposta (mínimo {fmtBRL(minBet)})
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-white/40">R$</span>
              <input
                type="number" inputMode="decimal" min={minBet} step={1}
                value={Number.isFinite(stake) ? stake : ''}
                onChange={(e) => setStake(Math.max(0, Number(e.target.value)))}
                disabled={!open || submitting}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-3 pl-10 pr-3 font-mono text-base text-white placeholder:text-white/30 focus:border-amber-500/60 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                placeholder="0,00"
              />
            </div>
            <div className="flex gap-1">
              {QUICK_AMOUNTS.map((v) => (
                <button key={v} type="button" onClick={() => setStake(v)} disabled={!open || submitting}
                  className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] font-semibold text-white/70 transition hover:border-amber-500/40 hover:text-amber-300 disabled:opacity-40">
                  R${v}
                </button>
              ))}
            </div>
          </div>

          {/* Retorno estimado — só quando há pote (apostas abertas) e cotação real */}
          {hasReturn && stake >= minBet && (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
              <span className="text-white/70">Retorno estimado:</span>
              <span className="font-mono text-base font-bold text-amber-300">{fmtBRL(potentialWin)}</span>
            </div>
          )}

          {balance != null && (
            <div className="mt-2 text-right text-[11.5px] text-white/40">
              Saldo: <span className="font-mono text-white/70">{fmtBRL(balance)}</span>
            </div>
          )}

          {/* Como o prêmio é pago (sem jargão de motor) */}
          <p className="mt-3 text-[11px] leading-relaxed text-white/40">
            O prêmio é o pote total dividido entre quem acertar o campeão, proporcional ao valor apostado.
            O retorno final só é definido no fechamento das apostas e pode variar até lá — quem acerta nunca
            recebe menos que o valor apostado.
          </p>

          {error && (
            <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>
          )}
          {!isLoggedIn && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Faça login pra confirmar a aposta.</div>
          )}
          {!open && (
            <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/60">Mercado fechado no momento.</div>
          )}

          <div className="mt-5 flex gap-2 border-t border-white/10 pt-4">
            <button type="button" onClick={onClose} disabled={submitting}
              className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-50">
              Cancelar
            </button>
            <button type="button" onClick={() => void submit()} disabled={submitting || !open || (isLoggedIn && stake < minBet)}
              className="flex-1 rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-[#1a1106] transition hover:bg-amber-400 disabled:opacity-40">
              {submitting ? <span className="inline-flex items-center justify-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" /> Enviando…</span>
                : isLoggedIn ? <span className="inline-flex items-center justify-center gap-1.5"><Check className="h-4 w-4" /> Confirmar aposta</span>
                : <span className="inline-flex items-center justify-center gap-1.5"><Lock className="h-4 w-4" /> Entrar para apostar</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ArmageddonChampionShowcase;
