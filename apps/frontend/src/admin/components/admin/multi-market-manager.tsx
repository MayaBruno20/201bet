'use client';

/**
 * Multi-Mercados do Armageddon (motor pari-mutuel de N opções).
 *
 * Controle COMPLETO do motor pelo admin:
 *  - criar mercado (Campeão / Melhor Reação / Queimada) a partir do roster;
 *  - acompanhar pote por piloto, odds projetadas e share em tempo quase real;
 *  - pausar / reabrir / anular;
 *  - auditar o vencedor com preview do fechamento (pote, prêmio, sobra da casa);
 *  - pós-auditoria: fechamento financeiro real + lista de ganhadores e pagamentos.
 *
 * Regra de ouro do motor (espelhada do backend): rake fixo de 20% sai do topo;
 * odd efetiva = max(1.0, líquido / pote do vencedor). A casa NUNCA paga do
 * próprio bolso — no pior caso (esmagamento) a margem encolhe até 0, jamais
 * fica negativa.
 */

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Card, SectionTitle } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm } from '@admin/components/ui/confirm';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';

type RosterPilot = { driverId: string; name: string };

type Runner = {
  oddId: string;
  label: string;
  pool: number;
  tickets: number;
  poolShare: number;
  rawOdd: number;
  projectedOdd: number;
  flooredAt1: boolean;
  projectedPayout: number;
  projectedHouseGross: number;
};

type Financials = {
  totalPool: number;
  rakePercent: number;
  rakeNominal: number;
  netPool: number;
  runners: Runner[];
};

type MultiMarket = {
  id: string;
  name: string;
  type: 'WINNER' | 'QUALIFY' | 'BEST_REACTION' | 'FALSE_START';
  status: 'OPEN' | 'CLOSED' | 'SUSPENDED' | 'SETTLED';
  bookingCloseAt: string | null;
  settledAt: string | null;
  winnerOddId: string | null;
  financials: Financials;
};

type MarketSummary = {
  marketId: string;
  name: string;
  status: string;
  financials: Financials;
  settlement: {
    winnerLabel: string | null;
    totalPool: number;
    rakeCollected: number;
    totalPayout: number;
    houseNetProfit: number;
    winningBets: number;
    losingBets: number;
    winners: Array<{ betId: string; userName: string; userEmail: string; stake: number; payout: number }>;
  } | null;
};

const TYPE_LABEL: Record<MultiMarket['type'], string> = {
  WINNER: 'Vencedor Geral (Campeão)',
  QUALIFY: 'Classificados ao Resorteio (32)',
  BEST_REACTION: 'Melhor Reação',
  FALSE_START: 'Queimada',
};

// Tipos oferecidos hoje na criação. QUALIFY apura sozinho ao gerar o 2º sorteio.
const CREATABLE_TYPES: Array<{ type: MultiMarket['type']; hint: string }> = [
  { type: 'WINNER', hint: 'Campeão geral do evento (1 vencedor).' },
  { type: 'QUALIFY', hint: 'Os 32 classificados ao resorteio (vários vencedores). Apura automático ao gerar o 2º sorteio.' },
];

const STATUS_META: Record<MultiMarket['status'], { label: string; tone: string }> = {
  OPEN: { label: 'ABERTO', tone: '#3ee093' },
  SUSPENDED: { label: 'PAUSADO', tone: 'var(--accent)' },
  CLOSED: { label: 'FECHADO', tone: '#ff7585' },
  SETTLED: { label: 'AUDITADO', tone: '#7cd0ff' },
};

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function MultiMarketManager({ armageddonEventId, roster, eventName }: {
  armageddonEventId: string;
  roster: RosterPilot[];
  eventName?: string;
}) {
  const [markets, setMarkets] = React.useState<MultiMarket[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [settleTarget, setSettleTarget] = React.useState<MultiMarket | null>(null);
  const [summaryTarget, setSummaryTarget] = React.useState<MultiMarket | null>(null);
  const { push } = useToast();
  const confirm = useConfirm();

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await api.get<{ markets: MultiMarket[] }>(ENDPOINTS.ARMAGEDDON.markets.list(armageddonEventId));
      setMarkets(res.markets);
    } catch (e) { push({ title: 'Erro ao carregar multi-mercados', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { if (!opts?.silent) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armageddonEventId]);
  React.useEffect(() => { void load(); }, [load]);

  // Operação ao vivo: potes mudam a cada aposta — atualiza sozinho a cada 15s.
  React.useEffect(() => {
    const t = setInterval(() => { void load({ silent: true }); }, 15000);
    return () => clearInterval(t);
  }, [load]);

  const toggleSuspend = async (m: MultiMarket) => {
    const next = m.status === 'SUSPENDED' ? 'OPEN' : 'SUSPENDED';
    setBusy(m.id);
    try {
      await api.patch(ENDPOINTS.MARKETS.update(m.id), { status: next });
      push({ title: next === 'SUSPENDED' ? 'Mercado pausado' : 'Mercado reaberto', body: m.name, tone: next === 'SUSPENDED' ? 'amber' : 'emerald' });
      await load({ silent: true });
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const closeBooking = async (m: MultiMarket) => {
    const ok = await confirm({
      title: 'Fechar apostas?',
      body: <>Vai fechar <strong>{m.name}</strong> para novas apostas. O mercado fica aguardando a auditoria do vencedor (dá pra reabrir se precisar).</>,
      tone: 'warning',
      confirmLabel: 'Fechar apostas',
      icon: 'Clock',
    });
    if (!ok) return;
    setBusy(m.id);
    try {
      await api.patch(ENDPOINTS.MARKETS.update(m.id), { status: 'CLOSED' });
      push({ title: 'Apostas fechadas', body: m.name, tone: 'amber' });
      await load({ silent: true });
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const reopen = async (m: MultiMarket) => {
    setBusy(m.id);
    try {
      await api.patch(ENDPOINTS.MARKETS.update(m.id), { status: 'OPEN' });
      push({ title: 'Mercado reaberto', body: m.name, tone: 'emerald' });
      await load({ silent: true });
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const voidMarket = async (m: MultiMarket) => {
    const ok = await confirm({
      title: 'Anular multi-mercado?',
      body: <>Vai anular <strong>{m.name}</strong> e reembolsar TODAS as apostas em aberto. A casa não fica com nada.</>,
      tone: 'danger',
      confirmLabel: 'Anular e reembolsar',
      icon: 'AlertTriangle',
    });
    if (!ok) return;
    setBusy(m.id);
    try {
      await api.post(ENDPOINTS.MARKETS.void(m.id));
      push({ title: 'Mercado anulado', body: 'Apostas reembolsadas.', tone: 'amber' });
      await load({ silent: true });
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle
          title="Multi-Mercados (Campeão / Reação / Queimada)"
          sub="Pari-mutuel de N pilotos sobre o evento inteiro. Rake fixo de 20% — a casa nunca custeia prêmio."
          action={
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)} disabled={roster.length < 2}>
              <I.Plus size={14}/> Novo multi-mercado
            </button>
          }
        />
        {roster.length < 2 && (
          <div className="mt-2 text-[12px] text-[color:var(--text-3)]">
            Cadastre o roster do evento para liberar a criação de multi-mercados.
          </div>
        )}
      </Card>

      {loading && <Card className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Carregando multi-mercados…</Card>}

      {!loading && markets.length === 0 && (
        <Card className="p-8 text-center text-[13px] text-[color:var(--text-3)]">
          Nenhum multi-mercado criado ainda. Crie o mercado de <strong>Campeão</strong> para abrir as apostas no vencedor geral.
        </Card>
      )}

      {!loading && markets.map((m) => {
        const meta = STATUS_META[m.status];
        const winnerRunner = m.winnerOddId ? m.financials.runners.find((r) => r.oddId === m.winnerOddId) : null;
        const sorted = [...m.financials.runners].sort((a, b) => b.pool - a.pool);
        const withBets = sorted.filter((r) => r.pool > 0);
        const skew = withBets.some((r) => r.flooredAt1);
        return (
          <Card key={m.id} className="p-4">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">{TYPE_LABEL[m.type]}</div>
                <div className="font-display text-[16px] font-bold mt-0.5 truncate">{m.name}</div>
              </div>
              <span className="chip" style={{ background: meta.tone + '22', color: meta.tone, textTransform: 'uppercase', fontWeight: 700 }}>
                {meta.label}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              {[
                { l: 'Pote bruto', v: brl(m.financials.totalPool), c: '#7cd0ff' },
                { l: `Rake casa (${m.financials.rakePercent}%)`, v: brl(m.financials.rakeNominal), c: 'var(--emerald)' },
                { l: 'Pote líquido (prêmio)', v: brl(m.financials.netPool), c: '#a78bfa' },
                { l: 'Apostas', v: String(m.financials.runners.reduce((s, r) => s + r.tickets, 0)), c: 'var(--text)' },
              ].map((kpi) => (
                <div key={kpi.l}>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)] font-semibold">{kpi.l}</div>
                  <div className="font-mono font-bold text-[14px]" style={{ color: kpi.c }}>{kpi.v}</div>
                </div>
              ))}
            </div>

            {skew && m.status !== 'SETTLED' && (
              <div className="mt-3 rounded-[10px] px-3 py-2 text-[11.5px] flex items-start gap-2" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <I.AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Pote esmagado: a maior parte das apostas está num piloto só. Se ele vencer, a odd trava no piso 1.00
                (apostador recebe o stake de volta) e a margem da casa encolhe — mas nunca fica negativa.</span>
              </div>
            )}

            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {sorted.map((r) => {
                const isWinner = m.winnerOddId === r.oddId;
                return (
                  <div key={r.oddId} className="rounded-[10px] px-3 py-2 flex items-center justify-between gap-2"
                    style={{ background: isWinner ? 'rgba(33, 217, 122, 0.12)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (isWinner ? 'var(--emerald)' : 'var(--border)') }}>
                    <div className="text-[12.5px] font-semibold truncate flex items-center gap-1.5">{isWinner && <I.Trophy size={13} style={{ color: 'var(--emerald)', flexShrink: 0 }} />}<span className="truncate">{r.label}</span></div>
                    <div className="text-right flex-shrink-0 leading-tight">
                      <div className="font-mono font-bold text-[12px]" style={{ color: '#7cd0ff' }}>
                        {r.pool > 0 ? `${r.projectedOdd.toFixed(2)}x` : '—'}
                        <span className="ml-2" style={{ color: 'var(--text-3)' }}>{r.poolShare.toFixed(0)}%</span>
                      </div>
                      <div className="font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>
                        {brl(r.pool)} · {r.tickets} {r.tickets === 1 ? 'aposta' : 'apostas'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {m.status === 'SETTLED' && (
              <div className="mt-3 rounded-[10px] p-2.5 text-[12px] flex items-center justify-between gap-2 flex-wrap" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
                <span>Auditado · {m.type === 'QUALIFY' ? 'classificados pagos' : <>vencedor: <strong>{winnerRunner?.label ?? '—'}</strong></>}</span>
                <button className="btn btn-ghost text-[12px]" style={{ color: 'var(--emerald)' }} onClick={() => setSummaryTarget(m)}>
                  <I.Receipt size={13}/> Ver fechamento e ganhadores
                </button>
              </div>
            )}

            {m.status !== 'SETTLED' && m.type === 'QUALIFY' && (
              <div className="mt-3 rounded-[10px] px-3 py-2 text-[11.5px] flex items-start gap-2" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <I.Target size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Apuração automática: este mercado paga sozinho os apostadores dos 32 classificados quando você gerar o 2º sorteio. Use “Anular” só para reembolsar tudo.</span>
              </div>
            )}

            {m.status !== 'SETTLED' && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {m.type !== 'QUALIFY' && (
                  <button className="btn btn-primary" onClick={() => setSettleTarget(m)} disabled={busy === m.id}>
                    <I.Trophy size={13}/> Auditar vencedor
                  </button>
                )}
                {(m.status === 'OPEN' || m.status === 'SUSPENDED') && (
                  <button className="btn btn-ghost" onClick={() => toggleSuspend(m)} disabled={busy === m.id}
                    style={{ color: m.status === 'SUSPENDED' ? '#3ee093' : 'var(--accent)' }}>
                    {m.status === 'SUSPENDED' ? <><I.Play size={13}/> Reabrir</> : <><I.Pause size={13}/> Pausar</>}
                  </button>
                )}
                {m.status !== 'CLOSED' ? (
                  <button className="btn btn-ghost" onClick={() => closeBooking(m)} disabled={busy === m.id} style={{ color: '#ff7585' }}>
                    <I.X size={13}/> Fechar apostas
                  </button>
                ) : (
                  <button className="btn btn-ghost" onClick={() => reopen(m)} disabled={busy === m.id} style={{ color: '#3ee093' }}>
                    <I.Activity size={13}/> Reabrir apostas
                  </button>
                )}
                <button className="btn btn-ghost ml-auto" onClick={() => voidMarket(m)} disabled={busy === m.id} style={{ color: '#ff7585' }}>
                  <I.AlertTriangle size={13}/> Anular (reembolsa tudo)
                </button>
              </div>
            )}
          </Card>
        );
      })}

      {createOpen && (
        <CreateMultiMarketModal
          armageddonEventId={armageddonEventId}
          roster={roster}
          eventName={eventName}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); void load({ silent: true }); }}
        />
      )}

      {settleTarget && (
        <SettleMultiMarketModal
          market={settleTarget}
          onClose={() => setSettleTarget(null)}
          onSaved={() => { setSettleTarget(null); void load({ silent: true }); }}
        />
      )}

      {summaryTarget && (
        <SettlementSummaryModal
          marketId={summaryTarget.id}
          onClose={() => setSummaryTarget(null)}
        />
      )}
    </div>
  );
}

/* ───────────────────── Criar multi-mercado ───────────────────── */

function CreateMultiMarketModal({ armageddonEventId, roster, eventName, onClose, onSaved }: {
  armageddonEventId: string;
  roster: RosterPilot[];
  eventName?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = React.useState<MultiMarket['type']>('WINNER');
  const [name, setName] = React.useState(eventName ? `Campeão — ${eventName}` : 'Campeão do Armageddon');
  const [mode, setMode] = React.useState<'all' | 'pick'>('all');
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const onTypeChange = (t: MultiMarket['type']) => {
    setType(t);
    // QUALIFY usa todos os pilotos do roster por definição (os 32 saem do bracket).
    if (t === 'QUALIFY') setMode('all');
    const prefix = t === 'WINNER' ? 'Campeão' : t === 'QUALIFY' ? 'Classificados ao Resorteio' : t === 'BEST_REACTION' ? 'Melhor Reação' : 'Queimada';
    setName(eventName ? `${prefix} — ${eventName}` : `${prefix} do Armageddon`);
  };

  const filtered = roster.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
  const selectedCount = mode === 'all' ? roster.length : picked.size;

  const submit = async () => {
    if (name.trim().length < 3) { push({ title: 'Informe o nome do mercado', tone: 'rose' }); return; }
    if (mode === 'pick' && picked.size < 2) { push({ title: 'Selecione pelo menos 2 pilotos', tone: 'rose' }); return; }
    setBusy(true);
    try {
      await api.post(ENDPOINTS.ARMAGEDDON.markets.create(armageddonEventId), {
        name: name.trim(),
        type,
        ...(mode === 'pick' ? { driverIds: [...picked] } : {}),
      });
      push({ title: 'Multi-mercado criado', body: `${name.trim()} aberto para apostas.`, tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro ao criar mercado', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="font-display text-[18px] font-bold">Novo multi-mercado</div>
        <div className="text-[12px] text-[color:var(--text-3)] mt-0.5">
          As odds são dinâmicas: o pote é dividido entre quem acertar, proporcional ao valor apostado.
        </div>

        <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mt-4 mb-2">Tipo de mercado</div>
        <div className="grid grid-cols-1 gap-2">
          {CREATABLE_TYPES.map(({ type: t, hint }) => (
            <button key={t} type="button" onClick={() => onTypeChange(t)}
              className="w-full surface-2 p-3 flex items-start justify-between gap-3 text-left"
              style={{ borderRadius: 12, border: '1px solid ' + (type === t ? 'var(--accent)' : 'var(--border)'), background: type === t ? 'var(--accent-soft)' : undefined }}>
              <span className="min-w-0">
                <span className="block font-semibold text-[13px]">{TYPE_LABEL[t]}</span>
                <span className="block text-[11px] text-[color:var(--text-3)] mt-0.5">{hint}</span>
              </span>
              {type === t && <I.Check size={15} style={{ color: 'var(--accent)', flexShrink: 0 }}/>}
            </button>
          ))}
        </div>

        <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mt-4 mb-2">Nome exibido no site</div>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Ex.: Campeão — Armageddon 2026"/>

        <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mt-4 mb-2">
          Pilotos do mercado ({selectedCount})
        </div>
        <div className="flex gap-2 mb-2">
          <button type="button" className="btn btn-ghost flex-1 justify-center" onClick={() => setMode('all')}
            style={{ border: '1px solid ' + (mode === 'all' ? 'var(--accent)' : 'var(--border)'), color: mode === 'all' ? 'var(--accent)' : undefined }}>
            Todos do roster ({roster.length})
          </button>
          <button type="button" className="btn btn-ghost flex-1 justify-center" onClick={() => setMode('pick')}
            style={{ border: '1px solid ' + (mode === 'pick' ? 'var(--accent)' : 'var(--border)'), color: mode === 'pick' ? 'var(--accent)' : undefined }}>
            Selecionar pilotos
          </button>
        </div>

        {mode === 'pick' && (
          <>
            <input className="input mb-2" placeholder="Filtrar piloto…" value={filter} onChange={(e) => setFilter(e.target.value)}/>
            <div className="max-h-[32vh] overflow-y-auto space-y-1 pr-1">
              {filtered.map((p) => {
                const on = picked.has(p.driverId);
                return (
                  <button key={p.driverId} type="button"
                    onClick={() => setPicked((prev) => { const n = new Set(prev); if (on) n.delete(p.driverId); else n.add(p.driverId); return n; })}
                    className="w-full surface-2 px-3 py-2 flex items-center justify-between"
                    style={{ borderRadius: 10, border: '1px solid ' + (on ? 'var(--emerald)' : 'var(--border)'), background: on ? 'var(--emerald-soft)' : undefined }}>
                    <span className="text-[12.5px] font-semibold">{p.name}</span>
                    {on && <I.Check size={14} style={{ color: 'var(--emerald)' }}/>}
                  </button>
                );
              })}
              {filtered.length === 0 && <div className="text-[12px] text-[color:var(--text-3)] p-2">Nenhum piloto com esse filtro.</div>}
            </div>
          </>
        )}

        <div className="mt-4 rounded-[10px] px-3 py-2 text-[11.5px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
          Margem da casa: <strong>20% fixos</strong> sobre o pote bruto (regulamento). O lucro exibido é a margem
          realizada (pote − prêmios pagos) — a casa só sedia as apostas, nunca custeia prêmio.
        </div>

        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy || (mode === 'pick' && picked.size < 2)}>
            {busy ? <><span className="pulse-dot"/> Criando…</> : <><I.Plus size={14}/> Criar e abrir apostas</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── Auditar vencedor ───────────────────── */

function SettleMultiMarketModal({ market, onClose, onSaved }: {
  market: MultiMarket;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [winnerOddId, setWinnerOddId] = React.useState<string>('');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const sorted = [...market.financials.runners].sort((a, b) => b.pool - a.pool);
  const selected = market.financials.runners.find((r) => r.oddId === winnerOddId) ?? null;

  const submit = async () => {
    if (!winnerOddId) return;
    setBusy(true);
    try {
      await api.post(ENDPOINTS.MARKETS.settle(market.id), { winnerOddId });
      push({ title: 'Mercado auditado', body: `${market.name} — prêmios pagos automaticamente.`, tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro ao auditar', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
            <I.Trophy size={18}/>
          </div>
          <div className="flex-1">
            <div className="font-display text-[18px] font-bold">Auditar campeão</div>
            <div className="text-[12px] text-[color:var(--text-3)]">{market.name}</div>
          </div>
        </div>

        <div className="mt-4 rounded-[10px] px-3 py-2 text-[12px] flex items-start gap-2" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <I.AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Ação irreversível. Quem apostou no vencedor recebe na hora; o restante fica como perdido.</span>
        </div>

        <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mt-4 mb-2">Selecione o vencedor</div>
        <div className="space-y-2 max-h-[36vh] overflow-y-auto pr-1">
          {sorted.map((r) => (
            <button key={r.oddId} type="button" onClick={() => setWinnerOddId(r.oddId)}
              className="w-full surface-2 p-3 flex items-center justify-between gap-3"
              style={{ border: '1px solid ' + (winnerOddId === r.oddId ? 'var(--emerald)' : 'var(--border)'), background: winnerOddId === r.oddId ? 'var(--emerald-soft)' : undefined }}>
              <div className="font-semibold text-[13px] truncate">{r.label}</div>
              <div className="text-right leading-tight flex-shrink-0">
                <div className="font-mono font-bold text-[12px]" style={{ color: '#7cd0ff' }}>
                  {r.pool > 0 ? `${r.projectedOdd.toFixed(2)}x` : 'sem apostas'}
                </div>
                <div className="font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>{brl(r.pool)} · {r.poolShare.toFixed(0)}%</div>
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="mt-3 rounded-[10px] p-3 text-[12px] space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
            <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Pote total</span><span className="font-mono font-bold">{brl(market.financials.totalPool)}</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Prêmio aos ganhadores</span><span className="font-mono font-bold">{brl(selected.projectedPayout)}</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-3)' }}>Fica com a casa (bruto)</span><span className="font-mono font-bold" style={{ color: 'var(--emerald)' }}>{brl(selected.projectedHouseGross)}</span></div>
            {selected.flooredAt1 && (
              <div style={{ color: 'var(--accent)' }}>Piso 1.00 aplicado (pote esmagado): ganhadores recebem o stake de volta; margem da casa reduzida, nunca negativa.</div>
            )}
            {selected.pool === 0 && market.financials.totalPool > 0 && (
              <div className="flex items-start gap-2" style={{ color: 'var(--accent)' }}>
                <I.AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Ninguém apostou neste piloto: nenhum prêmio será pago e o pote inteiro ({brl(market.financials.totalPool)}) fica com a casa.
                Para devolver as apostas, prefira “Anular”.</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={!winnerOddId || busy}>
            {busy ? <><span className="pulse-dot"/> Auditando…</> : <><I.Check size={14}/> Confirmar e pagar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Fechamento financeiro + ganhadores ───────────────── */

function SettlementSummaryModal({ marketId, onClose }: { marketId: string; onClose: () => void }) {
  const [summary, setSummary] = React.useState<MarketSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { push } = useToast();

  React.useEffect(() => {
    (async () => {
      try { setSummary(await api.get<MarketSummary>(ENDPOINTS.MARKETS.summary(marketId))); }
      catch (e) { push({ title: 'Erro ao carregar fechamento', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
      finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketId]);

  const s = summary?.settlement ?? null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-display text-[18px] font-bold">Fechamento financeiro</div>
            <div className="text-[12px] text-[color:var(--text-3)]">{summary?.name ?? ''}</div>
          </div>
          <button className="btn btn-icon" onClick={onClose}><I.X size={15}/></button>
        </div>

        {loading && <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</div>}

        {!loading && s && (
          <>
            <div className="grid grid-cols-2 gap-3 mt-4">
              {[
                { l: 'Pote bruto', v: brl(s.totalPool), c: '#7cd0ff' },
                { l: 'Prêmios pagos', v: brl(s.totalPayout), c: '#a78bfa' },
                { l: 'Lucro da casa', v: brl(s.houseNetProfit), c: 'var(--emerald)' },
              ].map((kpi) => (
                <div key={kpi.l} className="surface-2 p-3" style={{ borderRadius: 12 }}>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)] font-semibold">{kpi.l}</div>
                  <div className="font-mono font-bold text-[15px] mt-0.5" style={{ color: kpi.c }}>{kpi.v}</div>
                </div>
              ))}
            </div>

            <div className="mt-3 text-[12px] text-[color:var(--text-2)]">
              Vencedor: <strong style={{ color: 'var(--emerald)' }}>{s.winnerLabel ?? '—'}</strong> · {s.winningBets} {s.winningBets === 1 ? 'aposta premiada' : 'apostas premiadas'} · {s.losingBets} perdedoras
            </div>

            <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mt-4 mb-2 flex items-center gap-1.5">
              <I.Wallet size={13} /> Pagamento aos ganhadores
            </div>
            {s.winners.length === 0 ? (
              <div className="rounded-[10px] px-3 py-2 text-[12px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                Ninguém apostou no vencedor — todo o pote ficou com a casa.
              </div>
            ) : (
              <div className="space-y-1 max-h-[34vh] overflow-y-auto pr-1">
                {s.winners.map((w) => (
                  <div key={w.betId} className="surface-2 px-3 py-2 flex items-center justify-between gap-2" style={{ borderRadius: 10 }}>
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold truncate">{w.userName}</div>
                      <div className="text-[10.5px] text-[color:var(--text-3)] truncate">{w.userEmail}</div>
                    </div>
                    <div className="text-right flex-shrink-0 leading-tight">
                      <div className="font-mono font-bold text-[12.5px]" style={{ color: 'var(--emerald)' }}>+{brl(w.payout)}</div>
                      <div className="font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>apostou {brl(w.stake)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!loading && !s && (
          <div className="p-6 text-center text-[13px] text-[color:var(--text-3)]">Este mercado ainda não foi auditado.</div>
        )}
      </div>
    </div>
  );
}
