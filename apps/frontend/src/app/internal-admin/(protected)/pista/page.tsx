'use client';

/**
 * Modo Pista — tela de auditoria rápida pensada pro celular do auditor na
 * cabeceira da pista: todos os embates num feed único, com abrir/fechar
 * mercado e auditoria do vencedor em dois toques.
 *
 * Cada origem tem seus verbos (ver `closeMarket`/`openMarket`/`settleDuel`):
 * matchups de Lista/Copa/Armageddon usam os endpoints da origem (liquidar por
 * lá avança o chaveamento); embates rápidos e personalizados usam
 * close-booking/settle próprios (sem reabrir); multi-mercados usam o
 * PATCH/settle genérico de mercados.
 */

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Page } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm } from '@admin/components/ui/confirm';
import { fetchMarkets, type MarketRow } from '@admin/lib/data';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';

type OriginKind = 'LIST' | 'ARMAGEDDON' | 'CATEGORY' | 'QUICK' | 'CUSTOM' | 'MULTI';
type Side = 'LEFT' | 'RIGHT';
type Tab = 'all' | 'open' | 'waiting' | 'settled';

const originOf = (m: MarketRow): OriginKind =>
  m.matchupOrigin?.type ?? (m.duelId ? (m.duelIsCustom ? 'CUSTOM' : 'QUICK') : 'MULTI');

const ORIGIN_META: Record<OriginKind, { label: string; color: string }> = {
  LIST: { label: 'Lista', color: '#7cd0ff' },
  ARMAGEDDON: { label: 'Armageddon', color: 'var(--accent)' },
  CATEGORY: { label: 'Copa', color: '#a78bfa' },
  QUICK: { label: 'Rápido', color: '#3ee093' },
  CUSTOM: { label: 'Personalizado', color: '#ff7585' },
  MULTI: { label: 'Multi', color: 'var(--text-2)' },
};

const STATUS_META: Record<MarketRow['status'], { label: string; color: string }> = {
  OPEN: { label: 'ABERTO', color: '#3ee093' },
  CLOSED: { label: 'FECHADO', color: '#ff7585' },
  SUSPENDED: { label: 'PAUSADO', color: 'var(--accent)' },
  SETTLED: { label: 'AUDITADO', color: '#7cd0ff' },
};

const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const fmtHour = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Preview do payout de duelo — espelha a liquidação (rake 20%, casa nunca paga do bolso). */
function duelPayout(m: MarketRow, winnerPool: number) {
  const keep = m.rakePercent != null ? 1 - m.rakePercent / 100 : 0.8;
  const net = m.totalPool * keep;
  return winnerPool > 0 ? winnerPool * Math.max(1, net / winnerPool) : 0;
}

/* ─── Componentes do card (top-level: estado sobrevive ao polling) ─── */

const DuelSides: React.FC<{ m: MarketRow; auditing: boolean; disabled: boolean; onPick: (side: Side) => void }> =
  ({ m, auditing, disabled, onPick }) => {
    const o = m.matchupOrigin;
    const sides: Array<{ side: Side; label: string; pool: number; pos: number | null }> = [
      { side: 'LEFT', label: m.odds[0]?.label ?? '—', pool: m.leftPool, pos: o?.leftPosition ?? null },
      { side: 'RIGHT', label: m.odds[1]?.label ?? '—', pool: m.rightPool, pos: o?.rightPosition ?? null },
    ];
    return (
      <div className="grid grid-cols-2 gap-2 mt-3">
        {sides.map(({ side, label, pool, pos }, idx) => {
          const share = m.totalPool > 0 ? (pool / m.totalPool) * 100 : 50;
          const won = m.status === 'SETTLED' && m.winnerOddId === m.odds[idx]?.id;
          return (
            <button key={side} type="button"
              onClick={() => auditing && onPick(side)}
              disabled={!auditing || disabled}
              className="rounded-[12px] p-3 text-left transition-all focusable"
              style={{
                minHeight: 76,
                background: won ? 'var(--emerald-soft)' : auditing ? 'rgba(33,217,122,0.06)' : 'var(--surface-2)',
                border: '1.5px solid ' + (won ? 'var(--emerald)' : auditing ? 'rgba(33,217,122,0.5)' : 'var(--border)'),
                cursor: auditing ? 'pointer' : 'default',
              }}>
              <div className="flex items-center gap-1.5">
                {pos != null && (
                  <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded-[6px] shrink-0"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>#{pos}</span>
                )}
                {won && <I.Trophy size={13} style={{ color: 'var(--emerald)' }}/>}
              </div>
              <div className="font-semibold text-[14px] leading-snug mt-1 break-words">{label}</div>
              <div className="font-mono text-[11.5px] mt-1" style={{ color: 'var(--text-3)' }}>
                {fmtBRL(pool)} · <span style={{ color: '#7cd0ff' }}>{share.toFixed(0)}%</span>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

const MultiOdds: React.FC<{ m: MarketRow; auditing: boolean; disabled: boolean; onPick: (oddId: string) => void }> =
  ({ m, auditing, disabled, onPick }) => {
    const [expanded, setExpanded] = React.useState(false);
    // Vencedor sempre primeiro quando auditado — zebra fora do top-4 de pote
    // não pode ficar escondida atrás do "ver todas".
    const sorted = [...m.odds].sort((a, b) =>
      Number(b.id === m.winnerOddId) - Number(a.id === m.winnerOddId) || b.pool - a.pool);
    const visible = expanded || auditing ? sorted : sorted.slice(0, 4);
    return (
      <div className="mt-3 space-y-1.5">
        {visible.map((o) => {
          const share = m.totalPool > 0 ? (o.pool / m.totalPool) * 100 : 0;
          const won = m.status === 'SETTLED' && m.winnerOddId === o.id;
          return (
            <button key={o.id} type="button"
              onClick={() => auditing && onPick(o.id)}
              disabled={!auditing || disabled}
              className="w-full rounded-[10px] px-3 py-2.5 flex items-center justify-between gap-2 text-left focusable"
              style={{
                background: won ? 'var(--emerald-soft)' : auditing ? 'rgba(33,217,122,0.06)' : 'rgba(255,255,255,0.02)',
                border: '1px solid ' + (won ? 'var(--emerald)' : auditing ? 'rgba(33,217,122,0.5)' : 'var(--border)'),
                cursor: auditing ? 'pointer' : 'default',
              }}>
              <span className="text-[13px] font-semibold truncate min-w-0 flex items-center gap-1.5">
                {won && <I.Trophy size={12} style={{ color: 'var(--emerald)' }}/>}
                <span className="truncate">{o.label}</span>
              </span>
              <span className="font-mono text-[11.5px] shrink-0" style={{ color: 'var(--text-3)' }}>
                {fmtBRL(o.pool)} · <span style={{ color: '#7cd0ff' }}>{share.toFixed(0)}%</span>
              </span>
            </button>
          );
        })}
        {!expanded && !auditing && sorted.length > 4 && (
          <button type="button" onClick={() => setExpanded(true)}
            className="w-full text-[12px] py-1.5 rounded-[8px]" style={{ color: 'var(--text-3)' }}>
            Ver todas as {sorted.length} opções <I.ChevronDown size={12} style={{ display: 'inline' }}/>
          </button>
        )}
      </div>
    );
  };

type CardProps = {
  m: MarketRow;
  auditing: boolean;
  isBusy: boolean;
  onClose: () => void;
  onOpen: () => void;
  onStartAudit: () => void;
  onCancelAudit: () => void;
  onSettleDuel: (side: Side) => void;
  onSettleMulti: (oddId: string) => void;
  onReopen: () => void;
};

const MarketCard: React.FC<CardProps> = ({ m, auditing, isBusy, onClose, onOpen, onStartAudit, onCancelAudit, onSettleDuel, onSettleMulti, onReopen }) => {
  const o = originOf(m);
  const om = ORIGIN_META[o];
  const st = STATUS_META[m.status];
  const isDuel = m.type === 'DUEL';
  const waiting = m.status === 'CLOSED' || m.status === 'SUSPENDED';
  const canReopen = waiting && (m.matchupOrigin != null || o === 'MULTI');
  // QUALIFY (classificados do resorteio) é liquidado automaticamente pelo 2º
  // sorteio do Armageddon — auditar manualmente pagaria só 1 vencedor.
  const canAudit = m.status !== 'SETTLED' && m.type !== 'QUALIFY'
    && (isDuel ? m.odds.length >= 2 : m.odds.length >= 1);
  // Padding vertical maior que o padrão do .btn — alvo de toque de pista.
  // Inline style porque py-3 do Tailwind perde pro padding do .btn (CSS sem layer).
  const btnPad = { paddingTop: 12, paddingBottom: 12 } as const;

  return (
    <div className="surface p-3.5 sm:p-4" style={auditing ? { borderColor: 'rgba(33,217,122,0.5)' } : undefined}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="chip" style={{ background: om.color + '22', color: om.color, fontWeight: 700 }}>{om.label}</span>
        {m.matchupOrigin?.context && (
          <span className="text-[11.5px] font-semibold" style={{ color: 'var(--text-2)' }}>{m.matchupOrigin.context}</span>
        )}
        <span className="flex-1"/>
        <span className="chip" style={{ background: st.color + '22', color: st.color, fontWeight: 700 }}>
          {m.status === 'OPEN' && <span className="w-1.5 h-1.5 rounded-full inline-block shrink-0" style={{ background: st.color }}/>}
          {st.label}
        </span>
      </div>

      <div className="mt-2 min-w-0">
        <div className="font-display text-[15px] font-bold leading-snug break-words">{m.name}</div>
        <div className="text-[11.5px] truncate" style={{ color: 'var(--text-3)' }}>{m.eventName}</div>
      </div>

      {isDuel
        ? <DuelSides m={m} auditing={auditing} disabled={isBusy} onPick={onSettleDuel}/>
        : <MultiOdds m={m} auditing={auditing} disabled={isBusy} onPick={onSettleMulti}/>}

      <div className="flex items-center justify-between mt-2.5 text-[11.5px]" style={{ color: 'var(--text-3)' }}>
        <span>Pote <span className="font-mono font-bold text-[12.5px]" style={{ color: 'var(--text)' }}>{fmtBRL(m.totalPool)}</span></span>
        {m.bookingCloseAt && m.status === 'OPEN' && (
          <span className="flex items-center gap-1"><I.Clock size={12}/> fecha {fmtHour(m.bookingCloseAt)}</span>
        )}
      </div>

      {auditing && (
        <div className="mt-3 rounded-[10px] px-3 py-2 text-[12.5px] font-semibold text-center"
          style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
          👆 Toque no vencedor
        </div>
      )}

      {m.type === 'QUALIFY' && m.status !== 'SETTLED' && (
        <div className="mt-2 text-[10.5px]" style={{ color: 'var(--text-3)' }}>
          Liquidado automaticamente pela apuração do 2º sorteio.
        </div>
      )}

      {m.status !== 'SETTLED' && (
        <div className="flex gap-2 mt-3">
          {auditing ? (
            <button className="btn btn-ghost flex-1 justify-center" style={btnPad}
              onClick={onCancelAudit} disabled={isBusy}>
              Cancelar
            </button>
          ) : (
            <>
              {m.status === 'OPEN' && (
                <button className="btn btn-ghost flex-1 justify-center" style={{ ...btnPad, color: 'var(--accent)' }}
                  onClick={onClose} disabled={isBusy}>
                  <I.Pause size={15}/> {isBusy ? 'Aguarde…' : o === 'MULTI' ? 'Pausar' : 'Fechar apostas'}
                </button>
              )}
              {canReopen && (
                <button className="btn btn-ghost flex-1 justify-center" style={{ ...btnPad, color: '#3ee093' }}
                  onClick={onOpen} disabled={isBusy}>
                  <I.Play size={15}/> {isBusy ? 'Aguarde…' : 'Reabrir'}
                </button>
              )}
              {canAudit && (
                <button className="btn btn-primary flex-1 justify-center" style={btnPad}
                  onClick={onStartAudit} disabled={isBusy}>
                  <I.Trophy size={15}/> Auditar
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Mercado já auditado: estornar a liquidação e reabrir pra nova passada
          (ex.: a passada foi invalidada e vão passar de novo). Copa QUALIFY
          não entra: é liquidado automaticamente pelo resorteio. */}
      {m.status === 'SETTLED' && m.type !== 'QUALIFY' && (
        <div className="flex gap-2 mt-3">
          <button className="btn btn-ghost flex-1 justify-center" style={{ ...btnPad, color: 'var(--accent)' }}
            onClick={onReopen} disabled={isBusy}>
            <I.RotateCcw size={15}/> {isBusy ? 'Aguarde…' : 'Reembolsar e reabrir'}
          </button>
        </div>
      )}
    </div>
  );
};

/* ─── Página ─── */

export default function PistaPage() {
  const [markets, setMarkets] = React.useState<MarketRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [updatedAt, setUpdatedAt] = React.useState<Date | null>(null);
  const [offline, setOffline] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>('all');
  const [eventFilter, setEventFilter] = React.useState('all');
  const [query, setQuery] = React.useState('');
  // Ações em voo por mercado — Set porque duas ações em cards diferentes
  // podem correr em paralelo sem uma apagar o "busy" da outra.
  const [busy, setBusy] = React.useState<ReadonlySet<string>>(new Set());
  // Mercado em modo auditoria (aguardando toque no vencedor)
  const [auditingId, setAuditingId] = React.useState<string | null>(null);
  const { push } = useToast();
  const confirm = useConfirm();

  // Ref pro polling enxergar o estado atual sem reiniciar o intervalo.
  const busyRef = React.useRef(false);
  busyRef.current = busy.size > 0;

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const rows = await fetchMarkets({ settledWithinHours: 12, throwOnError: true });
      // Modo Pista mostra só eventos ativos: esconde mercados de eventos
      // encerrados/cancelados (leftovers que ainda aparecem no feed ao vivo).
      const active = rows.filter((m) => m.eventStatus !== 'FINISHED' && m.eventStatus !== 'CANCELED');
      setMarkets(active);
      setUpdatedAt(new Date());
      setOffline(false);
    } catch {
      // Sinal ruim na pista é rotina: mantém a lista anterior e marca como
      // desatualizada em vez de mostrar um feed vazio "fresco".
      setOffline(true);
      if (!silent) push({ title: 'Sem conexão', body: 'Não foi possível atualizar os embates.', tone: 'rose' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [push]);

  React.useEffect(() => { void load(); }, [load]);

  // Polling agressivo (10s) — operação de pista precisa de dado fresco.
  // Só pausa com ação em voo; em modo auditoria continua (se outro admin
  // liquidar o mercado, o efeito abaixo tira a tela do modo fantasma).
  React.useEffect(() => {
    const t = setInterval(() => {
      if (!busyRef.current && !document.hidden) void load(true);
    }, 10_000);
    return () => clearInterval(t);
  }, [load]);

  // Reconcilia o modo auditoria com o feed: se o mercado sumiu ou já foi
  // liquidado em outro lugar, sai do modo (senão o card fica fantasma).
  React.useEffect(() => {
    if (auditingId && !markets.some((m) => m.id === auditingId && m.status !== 'SETTLED')) {
      setAuditingId(null);
    }
  }, [markets, auditingId]);

  /* ─── Ações por origem ─── */

  const run = async (id: string, fn: () => Promise<unknown>, okTitle: string, okBody: string) => {
    setBusy((p) => new Set(p).add(id));
    try {
      await fn();
      push({ title: okTitle, body: okBody, tone: 'emerald' });
      setAuditingId(null);
      await load(true);
    } catch (e) {
      push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' });
    } finally {
      setBusy((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  const toggleMatchup = (m: MarketRow, open: boolean) => {
    const o = m.matchupOrigin!;
    const ep = o.type === 'LIST' ? ENDPOINTS.BRAZIL_LISTS.matchups.toggleMarket(o.matchupId)
      : o.type === 'ARMAGEDDON' ? ENDPOINTS.ARMAGEDDON.matchups.toggleMarket(o.matchupId)
      : ENDPOINTS.CATEGORY_EVENTS.matchups.toggleMarket(o.matchupId);
    return run(m.id, () => api.patch(ep, { open }),
      open ? 'Mercado aberto' : 'Mercado fechado', m.name);
  };

  const closeMarket = (m: MarketRow) => {
    const o = originOf(m);
    if (o === 'QUICK') return run(m.id, () => api.post(ENDPOINTS.QUICK_DUELS.closeBooking(m.duelId!)), 'Apostas fechadas', m.name);
    if (o === 'CUSTOM') return run(m.id, () => api.post(ENDPOINTS.CUSTOM_DUELS.closeBooking(m.duelId!)), 'Apostas fechadas', m.name);
    if (o === 'MULTI') return run(m.id, () => api.patch(ENDPOINTS.MARKETS.update(m.id), { status: 'SUSPENDED' }), 'Mercado pausado', m.name);
    return toggleMatchup(m, false);
  };

  const openMarket = (m: MarketRow) => {
    const o = originOf(m);
    // Embate rápido/personalizado não tem reabertura — o botão nem aparece.
    if (o === 'MULTI') return run(m.id, () => api.patch(ENDPOINTS.MARKETS.update(m.id), { status: 'OPEN' }), 'Mercado reaberto', m.name);
    return toggleMatchup(m, true);
  };

  const settleDuel = async (m: MarketRow, side: Side) => {
    const o = originOf(m);
    const idx = side === 'LEFT' ? 0 : 1;
    const winnerLabel = m.odds[idx]?.label ?? side;
    const winnerPool = side === 'LEFT' ? m.leftPool : m.rightPool;
    const payout = duelPayout(m, winnerPool);
    const ok = await confirm({
      title: 'Auditar vencedor?',
      body: (
        <>
          <strong>{winnerLabel}</strong> venceu {m.name}.
          <div className="mt-2 text-[12.5px]">
            Pote {fmtBRL(m.totalPool)} → paga <strong>{fmtBRL(payout)}</strong> aos ganhadores.
            {winnerPool === 0 && m.totalPool > 0 && (
              <div className="mt-1" style={{ color: 'var(--accent)' }}>
                ⚠ Ninguém apostou nesse lado: o pote inteiro fica com a casa.
              </div>
            )}
          </div>
          <div className="mt-2 text-[12px]" style={{ color: 'var(--text-3)' }}>Ação irreversível.</div>
        </>
      ),
      tone: 'danger',
      confirmLabel: 'Confirmar e pagar',
      icon: 'Trophy',
    });
    if (!ok) return;
    const fn = o === 'QUICK' ? () => api.post(ENDPOINTS.QUICK_DUELS.settle(m.duelId!), { winningSide: side })
      : o === 'CUSTOM' ? () => api.post(ENDPOINTS.CUSTOM_DUELS.settle(m.duelId!), { winningSide: side })
      : o === 'LIST' ? () => api.post(ENDPOINTS.BRAZIL_LISTS.matchups.settle(m.matchupOrigin!.matchupId), { winnerSide: side })
      : o === 'ARMAGEDDON' ? () => api.post(ENDPOINTS.ARMAGEDDON.matchups.settle(m.matchupOrigin!.matchupId), { winnerSide: side })
      : () => api.post(ENDPOINTS.CATEGORY_EVENTS.matchups.settle(m.matchupOrigin!.matchupId), { winnerSide: side });
    await run(m.id, fn, 'Auditado ✓', `${winnerLabel} venceu — ganhadores pagos.`);
  };

  const reopenMarket = async (m: MarketRow) => {
    const o = originOf(m);
    const isArma = o === 'ARMAGEDDON' && !!m.matchupOrigin;
    const ok = await confirm({
      title: 'Reembolsar e reabrir?',
      body: (
        <>
          Estorna a auditoria de <strong>{m.name}</strong>: reembolsa <strong>todas</strong> as
          apostas, desfaz os pagamentos aos ganhadores (o saldo deles pode ficar negativo) e
          reabre o mercado para uma nova passada.
          {isArma && (
            <div className="mt-2 font-semibold" style={{ color: 'var(--accent)' }}>
              ⚠ Armageddon: reverte o avanço da chave EM CASCATA — as apostas das baterias
              seguintes também serão estornadas.
            </div>
          )}
          <div className="mt-2 text-[12px]" style={{ color: 'var(--text-3)' }}>Ação irreversível.</div>
        </>
      ),
      tone: 'danger',
      confirmLabel: 'Reembolsar e reabrir',
      icon: 'RotateCcw',
    });
    if (!ok) return;
    const fn = isArma
      ? () => api.post(ENDPOINTS.ARMAGEDDON.matchups.reopen(m.matchupOrigin!.matchupId))
      : () => api.post(ENDPOINTS.MARKETS.reopen(m.id));
    await run(m.id, fn, 'Mercado reaberto', `${m.name} — apostas reembolsadas, mercado reaberto.`);
  };

  const settleMulti = async (m: MarketRow, oddId: string) => {
    const odd = m.odds.find((x) => x.id === oddId);
    if (!odd) return;
    const ok = await confirm({
      title: 'Auditar vencedor?',
      body: (
        <>
          <strong>{odd.label}</strong> vence {m.name}. Pote {fmtBRL(m.totalPool)}.
          <div className="mt-2 text-[12px]" style={{ color: 'var(--text-3)' }}>Ação irreversível.</div>
        </>
      ),
      tone: 'danger',
      confirmLabel: 'Confirmar e pagar',
      icon: 'Trophy',
    });
    if (!ok) return;
    await run(m.id, () => api.post(ENDPOINTS.MARKETS.settle(m.id), { winnerOddId: oddId }), 'Auditado ✓', `${odd.label} venceu.`);
  };

  /* ─── Filtros ─── */

  const counts = React.useMemo(() => ({
    all: markets.length,
    open: markets.filter((m) => m.status === 'OPEN').length,
    waiting: markets.filter((m) => m.status === 'CLOSED' || m.status === 'SUSPENDED').length,
    settled: markets.filter((m) => m.status === 'SETTLED').length,
  }), [markets]);

  const events = React.useMemo(() => ['all', ...Array.from(new Set(markets.map((m) => m.eventName)))], [markets]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const byTab = (m: MarketRow) =>
      tab === 'all' ? true
      : tab === 'open' ? m.status === 'OPEN'
      : tab === 'waiting' ? m.status === 'CLOSED' || m.status === 'SUSPENDED'
      : m.status === 'SETTLED';
    const byEvent = (m: MarketRow) => eventFilter === 'all' || m.eventName === eventFilter;
    const byQuery = (m: MarketRow) => {
      if (!q) return true;
      const o = m.matchupOrigin;
      const hay = [
        m.name, m.eventName, o?.context ?? '', ORIGIN_META[originOf(m)].label,
        ...m.odds.map((x) => x.label),
        o?.leftPosition != null ? `#${o.leftPosition}` : '',
        o?.rightPosition != null ? `#${o.rightPosition}` : '',
      ].join(' ').toLowerCase();
      return q.split(/\s+/).every((part) => hay.includes(part));
    };
    const ORDER: Record<MarketRow['status'], number> = { OPEN: 0, CLOSED: 1, SUSPENDED: 1, SETTLED: 2 };
    return markets.filter((m) => byTab(m) && byEvent(m) && byQuery(m)).sort((a, b) =>
      ORDER[a.status] - ORDER[b.status]
      || a.eventName.localeCompare(b.eventName)
      || (a.matchupOrigin?.leftPosition ?? 999) - (b.matchupOrigin?.leftPosition ?? 999));
  }, [markets, tab, eventFilter, query]);

  /* ─── Render ─── */

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'all', label: `Todos (${counts.all})` },
    { id: 'open', label: `Abertos (${counts.open})` },
    { id: 'waiting', label: `Aguardando (${counts.waiting})` },
    { id: 'settled', label: `Auditados (${counts.settled})` },
  ];

  return (
    <Page eyebrow="Operação" title="Modo Pista"
      sub="Auditoria rápida na cabeceira: feche o mercado quando a bateria alinhar, toque no vencedor quando cruzar."
      actions={
        <button className="btn btn-ghost focusable" onClick={() => void load()} disabled={loading}>
          <I.RotateCcw size={15}/> Atualizar
        </button>
      }>

      {/* Barra de controle fixa no scroll — busca + filtros sempre à mão */}
      <div className="sticky top-0 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-7 lg:px-7 pb-3 pt-1"
        style={{ background: 'rgba(7,8,12,0.88)', backdropFilter: 'blur(10px)' }}>
        <div className="relative">
          <I.Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-3)' }}/>
          <input className="input pl-9" placeholder="Piloto, #posição, evento, chave…"
            value={query} onChange={(e) => setQuery(e.target.value)}
            autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
        </div>
        <div className="flex items-center gap-2 mt-2 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="px-3 py-2 text-[12.5px] font-semibold rounded-[10px] whitespace-nowrap shrink-0"
              style={{
                background: tab === t.id ? 'var(--accent-soft)' : 'var(--surface-2)',
                color: tab === t.id ? 'var(--accent)' : 'var(--text-2)',
                border: '1px solid ' + (tab === t.id ? 'var(--accent-ring)' : 'var(--border)'),
              }}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <select className="input flex-1" style={{ maxWidth: 320 }}
            value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
            {events.map((e) => <option key={e} value={e}>{e === 'all' ? 'Todos os eventos' : e}</option>)}
          </select>
          <span className="text-[10.5px] font-mono shrink-0 flex items-center gap-1.5"
            style={{ color: offline ? '#ff7585' : 'var(--text-4)' }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: offline ? '#ff7585' : '#3ee093' }}/>
            {offline ? `sem conexão · ${updatedAt ? updatedAt.toLocaleTimeString('pt-BR') : '—'}` : (updatedAt ? updatedAt.toLocaleTimeString('pt-BR') : '—')}
          </span>
        </div>
      </div>

      <div className="max-w-xl mx-auto space-y-3 mt-3">
        {loading && markets.length === 0 && (
          <div className="surface p-8 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>Carregando embates…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="surface p-8 text-center text-[13px]" style={{ color: 'var(--text-3)' }}>
            Nenhum embate nessa visão.
          </div>
        )}
        {filtered.map((m) => (
          <MarketCard key={m.id} m={m}
            auditing={auditingId === m.id}
            isBusy={busy.has(m.id)}
            onClose={() => void closeMarket(m)}
            onOpen={() => void openMarket(m)}
            onStartAudit={() => setAuditingId(m.id)}
            onCancelAudit={() => setAuditingId(null)}
            onSettleDuel={(side) => void settleDuel(m, side)}
            onSettleMulti={(oddId) => void settleMulti(m, oddId)}
            onReopen={() => void reopenMarket(m)}
          />
        ))}
      </div>
    </Page>
  );
}
