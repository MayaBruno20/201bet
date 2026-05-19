'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Page, Card } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm } from '@admin/components/ui/confirm';
import { fetchMarkets, type MarketRow } from '@admin/lib/data';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';

const TONE = (s: MarketRow['status']) =>
  s === 'OPEN' ? '#3ee093'
  : s === 'SUSPENDED' ? 'var(--accent)'
  : s === 'SETTLED' ? '#7cd0ff'
  : '#ff7585';

const LABEL = (s: MarketRow['status']) =>
  s === 'OPEN' ? 'ABERTO'
  : s === 'SUSPENDED' ? 'PAUSADO'
  : s === 'SETTLED' ? 'AUDITADO'
  : 'FECHADO';

export default function MarketControlPage() {
  const [markets, setMarkets] = React.useState<MarketRow[]>([]);
  const [eventFilter, setEventFilter] = React.useState<string>('all');
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [auditModal, setAuditModal] = React.useState<MarketRow | null>(null);
  const [selectedWinnerOdd, setSelectedWinnerOdd] = React.useState<string>('');
  const { push } = useToast();
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    setMarkets(await fetchMarkets());
    setLoading(false);
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  // Polling leve (a cada 15s) — operação ao vivo precisa ver mudanças sem F5.
  React.useEffect(() => {
    const t = setInterval(() => { void load(); }, 15000);
    return () => clearInterval(t);
  }, [load]);

  // Página é "Mercados ao vivo": lista APENAS mercados OPEN.
  // Stats cards no topo continuam mostrando contadores totais (admin precisa ver
  // se tem CLOSED/SUSPENDED pendentes de auditoria em outra aba).
  const openMarkets = React.useMemo(() => markets.filter((m) => m.status === 'OPEN'), [markets]);
  const events = ['all', ...Array.from(new Set(openMarkets.map((m) => m.eventName)))];
  const filtered = eventFilter === 'all' ? openMarkets : openMarkets.filter((m) => m.eventName === eventFilter);

  // Agrupa por evento e calcula pote total do evento (só dos mercados OPEN)
  const groupedByEvent = React.useMemo(() => {
    const map = new Map<string, { eventId: string; eventName: string; eventPool: number; rows: MarketRow[] }>();
    for (const m of filtered) {
      const key = m.eventId;
      if (!map.has(key)) {
        map.set(key, { eventId: m.eventId, eventName: m.eventName, eventPool: 0, rows: [] });
      }
      const g = map.get(key)!;
      g.eventPool += m.totalPool;
      g.rows.push(m);
    }
    return Array.from(map.values()).sort((a, b) => b.eventPool - a.eventPool);
  }, [filtered]);

  const restartEvent = async (eventId: string, eventName: string) => {
    const ok = await confirm({
      title: 'Reiniciar evento?',
      body: (
        <>
          Vai <strong>reembolsar todas as apostas em aberto</strong> de <strong>{eventName}</strong> e
          resetar os potes pra zero. O evento volta ao estado de "acabou de abrir".
          Mercados já auditados ficam intocados.
        </>
      ),
      tone: 'danger',
      confirmLabel: 'Reembolsar e reiniciar',
      icon: 'AlertTriangle',
    });
    if (!ok) return;
    setBusy(eventId);
    try {
      await api.post(ENDPOINTS.MARKETS.restartEvent(eventId));
      push({ title: 'Evento reiniciado', body: `${eventName} resetado e apostas reembolsadas.`, tone: 'emerald' });
      await load();
    } catch (e) {
      push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' });
    } finally { setBusy(null); }
  };

  // Backend não expõe um endpoint genérico de "abrir/pausar/fechar" mercado. O que existe:
  //   - markets/:id/settle  (auditar vencedor — paga)
  //   - markets/:id/void    (anular — refund total)
  // Para mercados de Copa Categorias, o admin original abria/fechava via PATCH em matchups.
  // Aqui, exibimos só os botões de Auditar/Anular pra cobrir os casos universais.
  // Reabrir/pausar continua sendo feito na página da Copa Categorias / Listas / Armageddon.

  const settleMarket = async (m: MarketRow, winnerOddId: string) => {
    setBusy(m.id);
    try {
      await api.post(ENDPOINTS.MARKETS.settle(m.id), { winnerOddId });
      push({ title: 'Mercado auditado', body: `${m.name} — vencedor pago.`, tone: 'emerald' });
      setAuditModal(null);
      await load();
    } catch (e) {
      push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' });
    } finally { setBusy(null); }
  };

  const voidMarket = async (m: MarketRow) => {
    const ok = await confirm({
      title: 'Anular mercado?',
      body: <>Vai anular <strong>{m.name}</strong>. Todas as apostas em aberto serão reembolsadas automaticamente.</>,
      tone: 'danger',
      confirmLabel: 'Anular e reembolsar',
      icon: 'AlertTriangle',
    });
    if (!ok) return;
    setBusy(m.id);
    try {
      await api.post(ENDPOINTS.MARKETS.void(m.id));
      push({ title: 'Mercado anulado', body: 'Apostas reembolsadas.', tone: 'amber' });
      await load();
    } catch (e) {
      push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' });
    } finally { setBusy(null); }
  };

  const opened = markets.filter((m) => m.status === 'OPEN').length;
  const suspended = markets.filter((m) => m.status === 'SUSPENDED').length;
  const closed = markets.filter((m) => m.status === 'CLOSED').length;
  const settled = markets.filter((m) => m.status === 'SETTLED').length;
  // Volume total reflete só os mercados AO VIVO (OPEN) — fechados/auditados não contam.
  const totalVolume = openMarkets.reduce((s, m) => s + m.totalPool, 0);

  return (
    <Page eyebrow="Operação" title="Mercados ao vivo"
      sub="Liquide vencedores, anule mercados e acompanhe o pool em tempo real."
      actions={<>
        <button className="btn btn-ghost focusable" onClick={load} disabled={loading}><I.Activity size={15}/> Atualizar</button>
      </>}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
        {[
          { l: 'Abertos', v: opened, tone: '#3ee093' },
          { l: 'Pausados', v: suspended, tone: 'var(--accent)' },
          { l: 'Fechados', v: closed, tone: '#ff7585' },
          { l: 'Auditados', v: settled, tone: '#7cd0ff' },
          { l: 'Volume total', v: 'R$ ' + (totalVolume / 1000).toFixed(1) + 'k', tone: '#a78bfa' },
        ].map((m) => (
          <Card key={m.l} className="p-4">
            <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">{m.l}</div>
            <div className="font-display text-[24px] font-bold mt-1 tabular-nums" style={{ color: m.tone }}>{m.v}</div>
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          {events.map((e) => (
            <button key={e} onClick={() => setEventFilter(e)}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-[10px]"
              style={{ background: eventFilter === e ? 'var(--accent-soft)' : 'var(--surface-2)', color: eventFilter === e ? 'var(--accent)' : 'var(--text-2)' }}>
              {e === 'all' ? `Todos (${openMarkets.length})` : e}
            </button>
          ))}
        </div>

        {loading && (
          <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Carregando mercados…</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Nenhum mercado nessa visão.</div>
        )}

        {/* Agrupado por evento com pote total + botão reiniciar */}
        {groupedByEvent.map((group) => (
          <div key={group.eventId} className="border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap"
                 style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="min-w-0">
                <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Evento</div>
                <div className="font-display text-[15px] font-bold truncate">{group.eventName}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)] font-semibold">Pote total</div>
                  <div className="font-mono font-bold text-[14px]" style={{ color: '#7cd0ff' }}>
                    R$ {group.eventPool.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={() => restartEvent(group.eventId, group.eventName)}
                  disabled={busy === group.eventId}
                  style={{ color: 'var(--accent)' }}
                  title="Reembolsa apostas em aberto e zera os potes"
                >
                  <I.RotateCcw size={13}/> {busy === group.eventId ? 'Reiniciando…' : 'Reiniciar evento'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
          {group.rows.map((m) => {
            const canSettle = m.status === 'OPEN' || m.status === 'CLOSED' || m.status === 'SUSPENDED';
            const canVoid = m.status !== 'SETTLED';
            const winnerOdd = m.winnerOddId ? m.odds.find((o) => o.id === m.winnerOddId) : null;
            return (
              <div key={m.id} className="surface-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)] truncate">{m.eventName}</div>
                    <div className="font-display text-[15px] font-bold mt-0.5 truncate">{m.name}</div>
                  </div>
                  <span className="chip" style={{ background: TONE(m.status) + '22', color: TONE(m.status), textTransform: 'uppercase', fontWeight: 700 }}>
                    {LABEL(m.status)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)] font-semibold">Tipo</div>
                    <div className="font-mono font-bold text-[14px]" style={{ color: '#7cd0ff' }}>{m.type}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)] font-semibold">Pote</div>
                    <div className="font-mono font-bold text-[14px]">R$ {m.totalPool.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-3)] font-semibold">Rake</div>
                    <div className="font-mono font-bold text-[14px]">{m.rakePercent != null ? `${m.rakePercent}%` : '—'}</div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  {m.odds.map((o, idx) => {
                    const pos = m.matchupOrigin
                      ? (idx === 0 ? m.matchupOrigin.leftPosition : idx === 1 ? m.matchupOrigin.rightPosition : null)
                      : null;
                    const sidePool = idx === 0 ? m.leftPool : idx === 1 ? m.rightPool : 0;
                    const sideShare = m.totalPool > 0 ? (sidePool / m.totalPool) * 100 : 50;
                    return (
                      <div key={o.id} className="rounded-[10px] px-2 py-1.5 flex items-center justify-between gap-2"
                        style={{ background: m.winnerOddId === o.id ? 'rgba(33, 217, 122, 0.15)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (m.winnerOddId === o.id ? 'var(--emerald)' : 'var(--border)') }}>
                        <div className="text-[12px] font-semibold truncate flex items-center gap-1.5 min-w-0">
                          {m.winnerOddId === o.id && '🏆 '}
                          {pos != null && (
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-[6px] flex-shrink-0"
                              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                              #{pos}
                            </span>
                          )}
                          <span className="truncate">{o.label}</span>
                        </div>
                        <div className="text-right flex-shrink-0 leading-tight">
                          <div className="font-mono font-bold text-[12px]" style={{ color: '#7cd0ff' }}>{sideShare.toFixed(0)}%</div>
                          <div className="font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>
                            R$ {sidePool.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {winnerOdd && m.status === 'SETTLED' && (
                  <div className="mt-3 rounded-[10px] p-2 text-[11.5px]" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
                    Auditado · vencedor: <strong>{winnerOdd.label}</strong>
                  </div>
                )}

                <div className="flex gap-2 mt-3">
                  {canSettle && (
                    <button className="btn btn-primary flex-1 justify-center"
                      onClick={() => { setAuditModal(m); setSelectedWinnerOdd(m.odds[0]?.id ?? ''); }}
                      disabled={busy === m.id || m.odds.length < 2}>
                      <I.Trophy size={13}/> Auditar vencedor
                    </button>
                  )}
                  {canVoid && (
                    <button className="btn btn-ghost"
                      onClick={() => voidMarket(m)}
                      disabled={busy === m.id}
                      style={{ color: '#ff7585' }}>
                      <I.X size={13}/> Anular
                    </button>
                  )}
                </div>

                {m.status === 'OPEN' && (
                  <div className="mt-2 text-[10.5px] text-[color:var(--text-3)]">
                    Para abrir/pausar/fechar este mercado pré-liquidação, use a aba de origem
                    {m.type === 'DUEL' ? ' (Copa Categorias / Listas Brasil / Armageddon).' : '.'}
                  </div>
                )}
              </div>
            );
          })}
            </div>
          </div>
        ))}
      </Card>

      {/* ── Modal de auditoria do vencedor ── */}
      {auditModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
          <div className="surface-elev p-6 w-full max-w-md">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
                <I.Trophy size={18}/>
              </div>
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">Auditar vencedor</div>
                <div className="text-[12px] text-[color:var(--text-3)]">{auditModal.eventName} · {auditModal.name}</div>
              </div>
            </div>

            <div className="mt-4 rounded-[10px] px-3 py-2 text-[12px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              ⚠ Ação irreversível. Apostas no lado vencedor serão pagas; perdedores ficam como LOST.
            </div>

            <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mt-4 mb-2">Selecione o vencedor</div>
            <div className="space-y-2">
              {auditModal.odds.map((o, idx) => {
                const sidePool = idx === 0 ? auditModal.leftPool : idx === 1 ? auditModal.rightPool : 0;
                const sideShare = auditModal.totalPool > 0 ? (sidePool / auditModal.totalPool) * 100 : 50;
                return (
                  <button key={o.id} type="button" onClick={() => setSelectedWinnerOdd(o.id)}
                    className="w-full surface-2 p-3 flex items-center justify-between gap-3"
                    style={{ border: '1px solid ' + (selectedWinnerOdd === o.id ? 'var(--emerald)' : 'var(--border)'), background: selectedWinnerOdd === o.id ? 'var(--emerald-soft)' : undefined }}>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full grid place-items-center" style={{ border: '2px solid ' + (selectedWinnerOdd === o.id ? 'var(--emerald)' : 'var(--text-3)') }}>
                        {selectedWinnerOdd === o.id && <div className="w-2 h-2 rounded-full" style={{ background: 'var(--emerald)' }}/>}
                      </div>
                      <div className="font-semibold text-[13px]">{o.label}</div>
                    </div>
                    <div className="text-right leading-tight">
                      <div className="font-mono font-bold text-[13px]" style={{ color: '#7cd0ff' }}>{sideShare.toFixed(0)}%</div>
                      <div className="font-mono text-[10px]" style={{ color: 'var(--text-3)' }}>
                        R$ {sidePool.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 mt-5">
              <button className="btn btn-ghost flex-1 justify-center" onClick={() => setAuditModal(null)} disabled={!!busy}>
                Cancelar
              </button>
              <button className="btn btn-primary flex-1 justify-center"
                onClick={() => settleMarket(auditModal, selectedWinnerOdd)}
                disabled={!selectedWinnerOdd || !!busy}>
                {busy ? <><span className="pulse-dot"/> Auditando…</> : <><I.Check size={14}/> Confirmar e pagar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
