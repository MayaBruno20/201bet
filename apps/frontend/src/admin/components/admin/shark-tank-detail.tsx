'use client';

/**
 * Painel facilitado do Shark Tank (4 chaves A–D de 8 pilotos → Fase Final).
 * Três abas:
 *  - Cadastro: 32 pilotos nas chaves A–D (add manual) + "Gerar chaves".
 *  - Chaves & Auditoria: as 4 chaves em rodadas 8→4→2→1 (abrir/fechar/auditar/reabrir).
 *  - Fase Final: 4 desafios (finalista da chave × Top 20 da Lista Área 43).
 *
 * Espelha o armageddon-elimination-detail (mesmos primitivos, toasts, confirm),
 * mas usa ENDPOINTS.SHARK_TANK e a estrutura de 4 chaves + desafios finais.
 */

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Card, SectionTitle } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm } from '@admin/components/ui/confirm';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';

// Estrutura do Shark Tank: 4 chaves de 8 pilotos (eliminação simples 8→4→2→1).
const CHAVES = ['A', 'B', 'C', 'D'] as const;
const CHAVE_SIZE = 8;
const ROSTER_TOTAL = CHAVES.length * CHAVE_SIZE; // 32

type RosterEntry = {
  id: string;
  bracketKey: 'A' | 'B' | 'C' | 'D' | null;
  position: number;
  isKing: boolean;
  driverId: string;
  driverName: string;
  driverNickname: string | null;
  driverCarNumber: number | string | null;
  driverTeam: string | null;
};

// A busca de pilotos devolve ao menos { driverId, name }; team/nickname/carNumber
// são opcionais (usados só pra enriquecer o dropdown).
type DriverHit = {
  driverId: string;
  name: string;
  team?: string | null;
  nickname?: string | null;
  carNumber?: number | string | null;
};

type Matchup = {
  id: string;
  stage: 'FIRST_DRAW' | 'SECOND_DRAW';
  bracketKey: string | null;
  roundNumber: number;
  order: number;
  leftPosition: number | null;
  rightPosition: number | null;
  leftDriverId: string | null;
  rightDriverId: string | null;
  leftDriverName: string | null;
  rightDriverName: string | null;
  winnerSide: 'LEFT' | 'RIGHT' | null;
  marketOpen: boolean;
  duelId: string | null;
  settledAt: string | null;
  nextMatchupId: string | null;
  nextSlotSide: 'LEFT' | 'RIGHT' | null;
  isFinal: boolean;
  isThirdPlace: boolean;
};

type Detail = {
  id: string;
  name: string;
  status: string;
  bracketType: string;
  rosterCount: number;
  roster: RosterEntry[];
  matchups: Matchup[];
};

type FinMatchup = {
  id: string;
  leftPool: number;
  rightPool: number;
  totalPool: number;
  leftPercent: number;
  rightPercent: number;
};
type FinancialSummary = {
  totalPool: number;
  openMarkets: number;
  settledCount: number;
  totalMatchups: number;
  matchups: FinMatchup[];
};

type MarketScope = { bracketKey?: string; roundNumber?: number; stage?: string };

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function SharkTankDetail({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [fin, setFin] = React.useState<FinancialSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<'cadastro' | 'auditoria' | 'final'>('cadastro');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState<{ bracketKey: string; position: number } | null>(null);
  const [settleMatchup, setSettleMatchup] = React.useState<Matchup | null>(null);
  const [opponentMatchup, setOpponentMatchup] = React.useState<Matchup | null>(null);
  const { push } = useToast();
  const confirm = useConfirm();

  // silent=true → atualiza os dados SEM piscar o skeleton (usado após cada ação).
  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const d = await api.get<Detail>(ENDPOINTS.SHARK_TANK.detail(eventId));
      setDetail(d);
      if (d.matchups.length > 0) {
        try { setFin(await api.get<FinancialSummary>(ENDPOINTS.SHARK_TANK.financialSummary(eventId))); }
        catch { /* resumo financeiro é best-effort */ }
      }
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { if (!opts?.silent) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);
  React.useEffect(() => { void load(); }, [load]);

  const firstDraw = React.useMemo(() => (detail?.matchups ?? []).filter((m) => m.stage === 'FIRST_DRAW'), [detail]);
  const secondDraw = React.useMemo(() => (detail?.matchups ?? []).filter((m) => m.stage === 'SECOND_DRAW'), [detail]);

  const generate = async () => {
    const ok = await confirm({
      title: 'Gerar chaves (4 chaves de 8)?',
      body: 'Monta as árvores de eliminação das chaves A–D com base nos pilotos cadastrados. Posições vazias ficam sem piloto — o backend preenche o que der.',
      tone: 'info', confirmLabel: 'Gerar chaves', icon: 'Sparkles',
    });
    if (!ok) return;
    setBusy('gen');
    try {
      await api.post(ENDPOINTS.SHARK_TANK.generate(eventId));
      push({ title: 'Chaves geradas', tone: 'emerald' });
      setTab('auditoria');
      await load(); onChanged();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const clearKeys = async () => {
    const ok = await confirm({
      title: 'Refazer chaves?',
      body: 'Apaga todos os embates gerados (chaves e Fase Final) para sortear de novo. Os pilotos cadastrados ficam intactos. Só funciona se nenhum embate foi auditado e nenhum mercado está aberto.',
      tone: 'warning', confirmLabel: 'Refazer chaves', icon: 'Bolt',
    });
    if (!ok) return;
    setBusy('clear');
    try {
      await api.post(ENDPOINTS.SHARK_TANK.clearKeys(eventId));
      push({ title: 'Chaves zeradas', body: 'Pronto para gerar de novo.', tone: 'amber' });
      setTab('cadastro');
      await load(); onChanged();
    } catch (e) { push({ title: 'Não foi possível refazer', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const resetEvent = async () => {
    // Confirmação DUPLA — esta operação mexe em dinheiro (estorna apostas).
    const ok1 = await confirm({
      title: 'Reiniciar o evento inteiro?',
      body: 'As chaves voltam ao estado original (regeradas) e TODAS as apostas são estornadas: liquidadas são reembolsadas, abertas são devolvidas. Os pilotos cadastrados ficam intactos.',
      tone: 'danger', confirmLabel: 'Continuar', icon: 'Trash',
    });
    if (!ok1) return;
    const ok2 = await confirm({
      title: 'Tem CERTEZA absoluta?',
      body: 'Isso movimenta saldo dos apostadores (reembolso) e não tem como desfazer. Só confirme se for realmente reiniciar o evento.',
      tone: 'danger', confirmLabel: 'Reiniciar e estornar', icon: 'Trash',
    });
    if (!ok2) return;
    setBusy('reset');
    try {
      const r = await api.post<{ refunded?: number; voided?: number }>(ENDPOINTS.SHARK_TANK.resetEvent(eventId));
      push({ title: 'Evento reiniciado', body: `${r.refunded ?? 0} mercado(s) estornado(s), ${r.voided ?? 0} anulado(s). Chaves regeradas.`, tone: 'emerald' });
      setTab('auditoria');
      await load(); onChanged();
    } catch (e) { push({ title: 'Erro ao reiniciar', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const openMarkets = async (opts: MarketScope, busyKey: string) => {
    setBusy(busyKey);
    try {
      const r = await api.post<{ opened: number; total: number }>(ENDPOINTS.SHARK_TANK.openAllReady(eventId, opts));
      push({ title: `${r.opened}/${r.total} mercado(s) aberto(s)`, tone: 'emerald' });
      await load({ silent: true }); onChanged();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };
  const closeMarkets = async (opts: MarketScope, busyKey: string) => {
    setBusy(busyKey);
    try {
      const r = await api.post<{ closed: number; total: number }>(ENDPOINTS.SHARK_TANK.closeAllOpen(eventId, opts));
      push({ title: `${r.closed}/${r.total} mercado(s) fechado(s)`, tone: 'amber' });
      await load({ silent: true }); onChanged();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const toggleMarket = async (m: Matchup) => {
    setBusy(m.id);
    try {
      await api.patch(ENDPOINTS.SHARK_TANK.matchups.toggleMarket(m.id), { open: !m.marketOpen });
      push({ title: m.marketOpen ? 'Mercado fechado' : 'Mercado aberto', tone: m.marketOpen ? 'amber' : 'emerald' });
      await load({ silent: true }); onChanged();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const reopenMatchup = async (m: Matchup) => {
    const ok = await confirm({
      title: 'Reembolsar e reabrir?',
      body: 'Estorna a liquidação deste embate (reembolsa os apostadores) e reabre para nova auditoria. O avanço de chave é revertido em cascata.',
      tone: 'danger', confirmLabel: 'Reembolsar e reabrir', icon: 'RotateCcw',
    });
    if (!ok) return;
    setBusy(m.id);
    try {
      await api.post(ENDPOINTS.SHARK_TANK.matchups.reopen(m.id));
      push({ title: 'Embate reaberto', body: 'Apostas estornadas.', tone: 'amber' });
      await load({ silent: true }); onChanged();
    } catch (e) { push({ title: 'Erro ao reabrir', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const removeRoster = async (r: RosterEntry) => {
    setBusy(r.id);
    try {
      await api.del(ENDPOINTS.SHARK_TANK.roster.delete(eventId, r.id));
      await load({ silent: true }); onChanged();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  if (loading) return <Card className="p-12 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</Card>;
  if (!detail) return null;

  const rosterCount = detail.rosterCount ?? detail.roster.length;
  const finByMatchup = new Map((fin?.matchups ?? []).map((m) => [m.id, m]));
  const hasMatchups = firstDraw.length > 0 || secondDraw.length > 0;

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setTab('cadastro')} className={`tab ${tab === 'cadastro' ? 'active' : ''}`}>
            Cadastro <span className="text-[color:var(--text-4)]">({rosterCount}/{ROSTER_TOTAL})</span>
          </button>
          <button onClick={() => setTab('auditoria')} className={`tab ${tab === 'auditoria' ? 'active' : ''}`}>
            Chaves &amp; Auditoria <span className="text-[color:var(--text-4)]">({firstDraw.length})</span>
          </button>
          <button onClick={() => setTab('final')} className={`tab ${tab === 'final' ? 'active' : ''}`}>
            Fase Final <span className="text-[color:var(--text-4)]">({secondDraw.length})</span>
          </button>
          {hasMatchups && (
            <button className="btn btn-ghost focusable ml-auto text-[12px]" style={{ color: '#ff7585' }}
              onClick={resetEvent} disabled={busy === 'reset'}>
              {busy === 'reset' ? <><span className="pulse-dot"/> Reiniciando…</> : <><I.Trash size={13}/> Reiniciar evento</>}
            </button>
          )}
        </div>
      </Card>

      {tab === 'cadastro' && (
        <CadastroTab
          detail={detail} busy={busy} keysGenerated={firstDraw.length > 0}
          onAdd={(bracketKey, position) => setAddOpen({ bracketKey, position })}
          onRemove={removeRoster} onGenerate={generate} onClearKeys={clearKeys}
        />
      )}

      {tab === 'auditoria' && (
        <AuditoriaTab
          fin={fin} finByMatchup={finByMatchup} busy={busy} firstDraw={firstDraw}
          onToggleMarket={toggleMarket} onSettle={(m) => setSettleMatchup(m)} onReopen={reopenMatchup}
          onOpen={openMarkets} onClose={closeMarkets}
        />
      )}

      {tab === 'final' && (
        <FaseFinalTab
          finByMatchup={finByMatchup} busy={busy} secondDraw={secondDraw}
          onToggleMarket={toggleMarket} onSettle={(m) => setSettleMatchup(m)} onReopen={reopenMatchup}
          onSetOpponent={(m) => setOpponentMatchup(m)} onOpen={openMarkets} onClose={closeMarkets}
        />
      )}

      {addOpen && (
        <AddPilotModal
          eventId={eventId} bracketKey={addOpen.bracketKey} position={addOpen.position}
          onClose={() => setAddOpen(null)}
          onSaved={() => { setAddOpen(null); void load({ silent: true }); onChanged(); }}
        />
      )}

      {settleMatchup && (
        <SettleModal
          matchup={settleMatchup} onClose={() => setSettleMatchup(null)}
          onSaved={() => { setSettleMatchup(null); void load({ silent: true }); onChanged(); }}
        />
      )}

      {opponentMatchup && (
        <OpponentModal
          matchup={opponentMatchup} onClose={() => setOpponentMatchup(null)}
          onSaved={() => { setOpponentMatchup(null); void load({ silent: true }); onChanged(); }}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Cadastro ───────────────────────── */

function CadastroTab({ detail, busy, keysGenerated, onAdd, onRemove, onGenerate, onClearKeys }: {
  detail: Detail; busy: string | null; keysGenerated: boolean;
  onAdd: (bracketKey: string, position: number) => void;
  onRemove: (r: RosterEntry) => void; onGenerate: () => void; onClearKeys: () => void;
}) {
  const byKey = new Map<string, Map<number, RosterEntry>>();
  for (const k of CHAVES) byKey.set(k, new Map());
  for (const r of detail.roster) {
    if (r.bracketKey && byKey.has(r.bracketKey)) byKey.get(r.bracketKey)!.set(r.position, r);
  }
  const total = detail.roster.length;

  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle
        title="Cadastro nas chaves"
        sub={`Adicione os ${ROSTER_TOTAL} pilotos nas chaves A–D (8 por chave). Clique numa posição vazia para cadastrar.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-[color:var(--text-3)] tabular-nums">{total}/{ROSTER_TOTAL}</span>
            {keysGenerated && (
              <button className="btn btn-ghost focusable" style={{ color: 'var(--accent)' }} onClick={onClearKeys} disabled={busy === 'clear'}>
                {busy === 'clear' ? <><span className="pulse-dot"/> Refazendo…</> : <><I.Bolt size={14}/> Refazer chaves</>}
              </button>
            )}
            <button className="btn btn-primary focusable" onClick={onGenerate} disabled={busy === 'gen' || total < 2}>
              {busy === 'gen' ? <><span className="pulse-dot"/> Gerando…</> : <><I.Bolt size={14}/> Gerar chaves</>}
            </button>
          </div>
        }
      />
      {keysGenerated && (
        <div className="rounded-[10px] p-2.5 mb-3 text-[11.5px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          ⚠ As chaves já foram geradas. Recadastrar e gerar de novo só é permitido enquanto nenhum embate foi auditado.
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {CHAVES.map((k) => {
          const slots = byKey.get(k)!;
          const filled = slots.size;
          return (
            <div key={k} className="surface-2 p-3" style={{ borderRadius: 12 }}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-display text-[14px] font-bold">Chave {k}</div>
                <div className="text-[11px] text-[color:var(--text-3)]">{filled}/{CHAVE_SIZE}</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {Array.from({ length: CHAVE_SIZE }, (_, i) => i + 1).map((pos) => {
                  const r = slots.get(pos);
                  return (
                    <div key={pos}
                      className="flex items-center gap-1.5 px-2 py-1 text-[11.5px]"
                      style={{ borderRadius: 8, background: r ? 'var(--surface-3)' : 'transparent', border: '1px solid ' + (r ? 'var(--border)' : 'var(--border-subtle, var(--border))') }}>
                      <span className="text-[color:var(--text-4)] w-5 tabular-nums">{pos}</span>
                      {r ? (
                        <>
                          <span className="flex-1 truncate font-medium">
                            {r.isKing && <span title="King">👑 </span>}
                            {r.driverName}
                            {r.driverCarNumber != null && r.driverCarNumber !== '' && (
                              <span className="text-[color:var(--text-4)] font-normal"> · #{r.driverCarNumber}</span>
                            )}
                          </span>
                          <button className="btn-icon" style={{ color: '#ff7585' }} disabled={busy === r.id}
                            onClick={() => onRemove(r)} title="Remover"><I.X size={12}/></button>
                        </>
                      ) : (
                        <button className="flex-1 text-left text-[color:var(--text-4)] hover:text-[color:var(--accent)]"
                          onClick={() => onAdd(k, pos)}>+ adicionar</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AddPilotModal({ eventId, bracketKey, position, onClose, onSaved }: {
  eventId: string; bracketKey: string; position: number; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = React.useState('');
  const [nickname, setNickname] = React.useState('');
  const [hits, setHits] = React.useState<DriverHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [selected, setSelected] = React.useState<DriverHit | null>(null);
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  // Busca debounced enquanto digita (só se ainda não selecionou ninguém).
  React.useEffect(() => {
    if (selected) return;
    const q = name.trim();
    if (q.length < 2) { setHits([]); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      api.get<DriverHit[]>(ENDPOINTS.SHARK_TANK.driverSearch(q))
        .then((r) => { if (alive) setHits(r); })
        .catch(() => { if (alive) setHits([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [name, selected]);

  const pick = (h: DriverHit) => {
    setSelected(h);
    setName(h.name);
    if (!nickname && h.nickname) setNickname(h.nickname);
    setHits([]);
  };
  const clearPick = () => setSelected(null);

  const submit = async () => {
    if (!name.trim()) { push({ title: 'Informe o nome do piloto', tone: 'rose' }); return; }
    setBusy(true);
    try {
      await api.post(ENDPOINTS.SHARK_TANK.roster.upsert(eventId), {
        ...(selected ? { driverId: selected.driverId } : { driverName: name.trim() }),
        driverNickname: nickname.trim() || undefined,
        bracketKey, position,
      });
      push({ title: 'Piloto cadastrado', tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-4 sm:p-6 w-full max-w-sm">
        <div className="font-display text-[18px] font-bold mb-1">Cadastrar piloto</div>
        <div className="text-[12px] text-[color:var(--text-3)] mb-4">Chave {bracketKey} · posição {position}</div>

        <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nome do piloto</label>
        <div className="relative mt-1">
          <input className="input" autoFocus value={name} placeholder="Digite nome ou sobrenome…"
            onChange={(e) => { setName(e.target.value); if (selected) setSelected(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (selected || !hits.length)) void submit(); }}/>
          {!selected && (name.trim().length >= 2) && (hits.length > 0 || searching) && (
            <div className="absolute z-10 left-0 right-0 mt-1 surface-elev p-1 max-h-56 overflow-auto" style={{ borderRadius: 10 }}>
              {searching && hits.length === 0 && <div className="px-2 py-2 text-[12px] text-[color:var(--text-3)]">Buscando…</div>}
              {hits.map((h) => (
                <button key={h.driverId} onClick={() => pick(h)}
                  className="w-full text-left px-2 py-1.5 rounded-[8px] hover:bg-[color:var(--surface-2)] flex items-center gap-2">
                  <span className="flex-1 truncate text-[12.5px] font-medium">{h.name}</span>
                  {(h.nickname || h.team) && (
                    <span className="text-[10.5px] text-[color:var(--text-3)] truncate">{h.nickname ?? h.team}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {selected ? (
          <div className="mt-2 flex items-center gap-2 text-[12px] surface-2 p-2" style={{ borderRadius: 8 }}>
            <I.Check size={14} style={{ color: 'var(--emerald)' }}/>
            <span className="flex-1">Piloto já cadastrado{selected.team ? ` · ${selected.team}` : ''}</span>
            <button className="text-[11px] text-[color:var(--accent)]" onClick={clearPick}>trocar</button>
          </div>
        ) : name.trim().length >= 2 && !searching ? (
          <div className="mt-2 text-[11.5px] text-[color:var(--text-3)]">
            Sem cadastro encontrado — será criado um novo piloto.
          </div>
        ) : null}

        <div className="mt-3">
          <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Apelido</label>
          <input className="input mt-1" value={nickname} placeholder="Como o piloto é conhecido (opcional)"
            onChange={(e) => setNickname(e.target.value)}/>
        </div>

        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Salvando…</> : <><I.Check size={14}/> Cadastrar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────── Chaves & Auditoria ───────────────────── */

function keyStats(ms: Matchup[]) {
  const total = ms.length;
  const settled = ms.filter((m) => m.winnerSide).length;
  const open = ms.filter((m) => m.marketOpen && !m.winnerSide).length;
  const ready = ms.filter((m) => !m.winnerSide && !m.marketOpen && m.leftDriverId && m.rightDriverId).length;
  return { total, settled, open, ready, done: total > 0 && settled === total };
}

// Eliminação simples 8→4→2→1: 3 rodadas por chave.
function chaveRoundLabel(rn: number): string {
  const map: Record<number, string> = { 1: 'Quartas', 2: 'Semifinal', 3: 'Final da chave' };
  return map[rn] ?? `Rodada ${rn}`;
}

function AuditoriaTab({ fin, finByMatchup, busy, firstDraw, onToggleMarket, onSettle, onReopen, onOpen, onClose }: {
  fin: FinancialSummary | null; finByMatchup: Map<string, FinMatchup>; busy: string | null;
  firstDraw: Matchup[];
  onToggleMarket: (m: Matchup) => void; onSettle: (m: Matchup) => void; onReopen: (m: Matchup) => void;
  onOpen: (opts: MarketScope, busyKey: string) => void; onClose: (opts: MarketScope, busyKey: string) => void;
}) {
  const chaves = CHAVES
    .map((k) => ({ key: k, matchups: firstDraw.filter((m) => m.bracketKey === k) }))
    .filter((k) => k.matchups.length);

  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const firstPending = chaves.find((k) => !keyStats(k.matchups).done);
    const init = new Set<string>();
    if (firstPending) init.add(firstPending.key); else if (chaves[0]) init.add(chaves[0].key);
    return init;
  });
  const toggle = (key: string) => setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  if (firstDraw.length === 0) {
    return <Card className="p-8 text-center text-[12.5px] text-[color:var(--text-3)]">
      Nenhuma chave ainda. Gere as chaves na aba Cadastro.
    </Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <SectionTitle title="Sessão de auditoria" sub="Abra os mercados rodada a rodada (Chave A → D). Feche por chave quando precisar."/>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard label="Pote total (volume)" value={brl(fin?.totalPool ?? 0)} accent="emerald"/>
          <StatCard label="Passadas" value={String(fin?.totalMatchups ?? firstDraw.length)}/>
          <StatCard label="Mercados abertos" value={String(fin?.openMarkets ?? 0)} accent="accent"/>
          <StatCard label="Auditados" value={`${fin?.settledCount ?? 0}/${fin?.totalMatchups ?? firstDraw.length}`}/>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="font-display text-[15px] font-bold">Chaves — 4 chaves de 8</div>
          <div className="text-[11px] text-[color:var(--text-3)]">Fluxo: Chave A → B → C → D</div>
        </div>
        <div className="space-y-2">
          {chaves.map((k) => {
            const st = keyStats(k.matchups);
            const isOpen = expanded.has(k.key);
            const closeBusy = busy === `close-${k.key}`;
            return (
              <div key={k.key} className="surface-2" style={{ borderRadius: 12, border: '1px solid ' + (st.done ? 'var(--emerald)' : st.open ? 'var(--accent)' : 'var(--border)') }}>
                <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  <button onClick={() => toggle(k.key)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <I.ChevronRight size={15} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--text-3)' }}/>
                    <span className="font-display text-[14px] font-bold">Chave {k.key}</span>
                    {st.done && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>✓ concluída</span>}
                    <span className="text-[11px] text-[color:var(--text-3)] truncate">
                      {st.settled}/{st.total} auditados{st.open ? ` · ${st.open} aberto(s)` : ''}{st.ready ? ` · ${st.ready} pronto(s)` : ''}
                    </span>
                  </button>
                  {st.open > 0 && (
                    <button className="btn btn-ghost focusable text-[11px]" style={{ color: 'var(--accent)' }}
                      onClick={() => onClose({ bracketKey: k.key, stage: 'FIRST_DRAW' }, `close-${k.key}`)} disabled={closeBusy}>
                      {closeBusy ? <><span className="pulse-dot"/> Fechando…</> : <>⏸ Fechar todos da chave ({st.open})</>}
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="px-3 pb-3 pt-1 border-t border-[color:var(--border)]">
                    <BracketKeyBlock scope={k.key} matchups={k.matchups} finByMatchup={finByMatchup} busy={busy}
                      onToggleMarket={onToggleMarket} onSettle={onSettle} onReopen={onReopen}
                      onOpenRound={(rn) => onOpen({ bracketKey: k.key, roundNumber: rn, stage: 'FIRST_DRAW' }, `open-${k.key}-${rn}`)}/>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'emerald' | 'accent' }) {
  const color = accent === 'emerald' ? 'var(--emerald)' : accent === 'accent' ? 'var(--accent)' : 'var(--text)';
  return (
    <div className="surface-2 p-3" style={{ borderRadius: 12 }}>
      <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">{label}</div>
      <div className="font-display text-[20px] font-bold mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

function BracketKeyBlock({ scope, matchups, finByMatchup, busy, onToggleMarket, onSettle, onReopen, onOpenRound }: {
  scope: string; matchups: Matchup[]; finByMatchup: Map<string, FinMatchup>; busy: string | null;
  onToggleMarket: (m: Matchup) => void; onSettle: (m: Matchup) => void; onReopen: (m: Matchup) => void;
  onOpenRound: (roundNumber: number) => void;
}) {
  const byRound = new Map<number, Matchup[]>();
  for (const m of matchups) { const a = byRound.get(m.roundNumber) ?? []; a.push(m); byRound.set(m.roundNumber, a); }
  const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);

  return (
    <div className="mb-1">
      {rounds.map((rn) => {
        const ms = (byRound.get(rn) ?? []).sort((a, b) => a.order - b.order);
        const ready = ms.filter((m) => !m.winnerSide && !m.marketOpen && m.leftDriverId && m.rightDriverId).length;
        const settled = ms.filter((m) => m.winnerSide).length;
        const openBusy = busy === `open-${scope}-${rn}`;
        return (
          <div key={rn} className="mb-3">
            <div className="flex flex-wrap items-center justify-between mb-1.5 gap-2">
              <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">
                {chaveRoundLabel(rn)} <span className="text-[color:var(--text-4)] normal-case tracking-normal">· {settled}/{ms.length}</span>
              </div>
              {ready > 0 && (
                <button className="text-[10px] font-bold px-2 py-1 rounded" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}
                  onClick={() => onOpenRound(rn)} disabled={openBusy}>
                  {openBusy ? 'Abrindo…' : `🚀 Abrir todos da rodada (${ready})`}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {ms.map((m) => (
                <MatchupRow key={m.id} m={m} fin={finByMatchup.get(m.id)} busy={busy}
                  onToggleMarket={onToggleMarket} onSettle={onSettle} onReopen={onReopen}/>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MatchupSide({ m, side, fin }: { m: Matchup; side: 'LEFT' | 'RIGHT'; fin?: FinMatchup }) {
  const name = side === 'LEFT' ? m.leftDriverName : m.rightDriverName;
  const won = m.winnerSide === side;
  const pct = side === 'LEFT' ? fin?.leftPercent : fin?.rightPercent;
  const pool = side === 'LEFT' ? fin?.leftPool : fin?.rightPool;
  return (
    <div className="flex items-center px-3 py-1.5 min-h-[34px]" style={{ background: won ? 'var(--emerald-soft)' : undefined }}>
      <span className="text-[12.5px] font-semibold flex-1 truncate" style={{ color: won ? 'var(--emerald)' : name ? undefined : 'var(--text-4)' }}>
        {won && '🏆 '}{name ?? '— a definir —'}
      </span>
      {fin && (pool ?? 0) > 0 && (
        <span className="text-[10px] text-[color:var(--text-3)] tabular-nums ml-2">{brl(pool ?? 0)} · {(pct ?? 0).toFixed(0)}%</span>
      )}
    </div>
  );
}

function MatchupRow({ m, fin, busy, onToggleMarket, onSettle, onReopen }: {
  m: Matchup; fin?: FinMatchup; busy: string | null;
  onToggleMarket: (m: Matchup) => void; onSettle: (m: Matchup) => void; onReopen: (m: Matchup) => void;
}) {
  const settled = !!m.winnerSide;
  const ready = !!m.leftDriverId && !!m.rightDriverId;
  const borderColor = settled ? 'var(--emerald)' : m.marketOpen ? 'var(--accent)' : 'var(--border)';
  return (
    <div className="surface-2 overflow-hidden" style={{ borderRadius: 12, border: '1px solid ' + borderColor }}>
      {m.marketOpen && !settled && (
        <div className="px-2 py-0.5 text-center text-[9px] font-bold uppercase tracking-[0.14em]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>🟢 Mercado aberto</div>
      )}
      <MatchupSide m={m} side="LEFT" fin={fin}/>
      <div className="border-t border-[color:var(--border)]"/>
      <MatchupSide m={m} side="RIGHT" fin={fin}/>
      {!settled && ready && (
        <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--border)' }}>
          <button className="text-[10px] font-bold py-1.5" disabled={busy === m.id} onClick={() => onToggleMarket(m)}
            style={{ background: m.marketOpen ? 'var(--accent-soft)' : 'var(--emerald-soft)', color: m.marketOpen ? 'var(--accent)' : 'var(--emerald)' }}>
            {m.marketOpen ? '⏸ Fechar mercado' : '🚀 Abrir mercado'}
          </button>
          <button className="text-[10px] font-bold py-1.5" onClick={() => onSettle(m)} style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>🏆 Definir vencedor</button>
        </div>
      )}
      {settled && (
        <button className="w-full text-[10px] font-bold py-1.5 border-t border-[color:var(--border)]" disabled={busy === m.id}
          onClick={() => onReopen(m)} style={{ background: 'var(--surface-3)', color: '#ff7585' }}>
          {busy === m.id ? 'Reabrindo…' : '↺ Reembolsar e reabrir'}
        </button>
      )}
    </div>
  );
}

function SettleModal({ matchup, onClose, onSaved }: { matchup: Matchup; onClose: () => void; onSaved: () => void }) {
  const [winner, setWinner] = React.useState<'LEFT' | 'RIGHT'>('LEFT');
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(ENDPOINTS.SHARK_TANK.matchups.settle(matchup.id), { winnerSide: winner, notes: notes.trim() || undefined });
      push({ title: 'Auditado', body: `Vencedor: ${winner === 'LEFT' ? matchup.leftDriverName : matchup.rightDriverName}`, tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-4 sm:p-6 w-full max-w-md">
        <div className="font-display text-[18px] font-bold mb-1">Definir vencedor</div>
        <div className="text-[12px] text-[color:var(--text-3)] mb-3">
          {matchup.stage === 'SECOND_DRAW' ? `Desafio #${matchup.order}` : `Chave ${matchup.bracketKey ?? '?'} · ${chaveRoundLabel(matchup.roundNumber)} · #${matchup.order}`}
        </div>
        <div className="rounded-[10px] p-3 mb-4 text-[12px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          ⚠ Ação irreversível. As apostas serão liquidadas e o vencedor avança automaticamente.
        </div>
        <div className="space-y-2">
          {(['LEFT', 'RIGHT'] as const).map((side) => {
            const name = side === 'LEFT' ? matchup.leftDriverName : matchup.rightDriverName;
            return (
              <button key={side} onClick={() => setWinner(side)} className="w-full surface-2 p-3 flex items-center justify-between"
                style={{ borderRadius: 12, border: '1px solid ' + (winner === side ? 'var(--emerald)' : 'var(--border)') }}>
                <span className="font-semibold text-[13px]">{name ?? side}</span>
                {winner === side && <I.Check size={16} style={{ color: 'var(--emerald)' }}/>}
              </button>
            );
          })}
        </div>
        <input className="input mt-3" placeholder="Notas (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)}/>
        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Auditando…</> : <><I.Trophy size={14}/> Confirmar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Fase Final ───────────────────────── */

function FaseFinalTab({ finByMatchup, busy, secondDraw, onToggleMarket, onSettle, onReopen, onSetOpponent, onOpen, onClose }: {
  finByMatchup: Map<string, FinMatchup>; busy: string | null; secondDraw: Matchup[];
  onToggleMarket: (m: Matchup) => void; onSettle: (m: Matchup) => void; onReopen: (m: Matchup) => void;
  onSetOpponent: (m: Matchup) => void;
  onOpen: (opts: MarketScope, busyKey: string) => void; onClose: (opts: MarketScope, busyKey: string) => void;
}) {
  if (secondDraw.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="font-display text-[15px] font-semibold">Fase Final — 4 desafios</div>
        <div className="text-[12.5px] text-[color:var(--text-3)] mt-1 max-w-md mx-auto">
          Os desafios aparecem quando as chaves são geradas. Cada finalista (Chave A–D) enfrenta um rival do Top 20 da Lista Área 43.
        </div>
      </Card>
    );
  }

  const challenges = [...secondDraw].sort((a, b) => a.order - b.order);
  const st = keyStats(secondDraw);
  const openBusy = busy === 'open-final';
  const closeBusy = busy === 'close-final';

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-display text-[15px] font-bold">Fase Final</div>
            <div className="text-[11.5px] text-[color:var(--text-3)] mt-0.5">
              Finalista da Chave A/B/C/D <span className="text-[color:var(--text-4)]">vs</span> Top 20 da Lista Área 43.
              O lado esquerdo é preenchido pela chave; defina o rival no lado direito.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {st.ready > 0 && (
              <button className="text-[10px] font-bold px-2 py-1 rounded" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}
                onClick={() => onOpen({ roundNumber: 1, stage: 'SECOND_DRAW' }, 'open-final')} disabled={openBusy}>
                {openBusy ? 'Abrindo…' : `🚀 Abrir todos (${st.ready})`}
              </button>
            )}
            {st.open > 0 && (
              <button className="btn btn-ghost focusable text-[11px]" style={{ color: 'var(--accent)' }}
                onClick={() => onClose({ stage: 'SECOND_DRAW' }, 'close-final')} disabled={closeBusy}>
                {closeBusy ? <><span className="pulse-dot"/> Fechando…</> : <>⏸ Fechar todos ({st.open})</>}
              </button>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {challenges.map((m, idx) => (
          <ChallengeCard key={m.id} m={m} desafio={idx + 1} fin={finByMatchup.get(m.id)} busy={busy}
            onToggleMarket={onToggleMarket} onSettle={onSettle} onReopen={onReopen} onSetOpponent={onSetOpponent}/>
        ))}
      </div>
    </div>
  );
}

function ChallengeCard({ m, desafio, fin, busy, onToggleMarket, onSettle, onReopen, onSetOpponent }: {
  m: Matchup; desafio: number; fin?: FinMatchup; busy: string | null;
  onToggleMarket: (m: Matchup) => void; onSettle: (m: Matchup) => void; onReopen: (m: Matchup) => void;
  onSetOpponent: (m: Matchup) => void;
}) {
  // LEFT auto-preenchido pela chave: order 1→A, 2→B, 3→C, 4→D.
  const chave = CHAVES[m.order - 1] ?? '?';
  const settled = !!m.winnerSide;
  const ready = !!m.leftDriverId && !!m.rightDriverId;
  const borderColor = settled ? 'var(--emerald)' : m.marketOpen ? 'var(--accent)' : 'var(--border)';

  return (
    <div className="surface-2 overflow-hidden" style={{ borderRadius: 12, border: '1px solid ' + borderColor }}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{ background: 'var(--surface-3)' }}>
        <span className="text-[11px] font-bold">Desafio {desafio}</span>
        <span className="text-[10px] text-[color:var(--text-3)]">Chave {chave} · Top 20 da Lista</span>
      </div>
      {m.marketOpen && !settled && (
        <div className="px-2 py-0.5 text-center text-[9px] font-bold uppercase tracking-[0.14em]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>🟢 Mercado aberto</div>
      )}

      {/* LEFT — finalista da chave (auto) */}
      {m.leftDriverName ? (
        <MatchupSide m={m} side="LEFT" fin={fin}/>
      ) : (
        <div className="flex items-center px-3 py-1.5 min-h-[34px]">
          <span className="text-[12px] flex-1 truncate italic text-[color:var(--text-4)]">Aguardando Chave {chave}…</span>
        </div>
      )}

      <div className="border-t border-[color:var(--border)]"/>

      {/* RIGHT — rival do Top 20 (manual) */}
      {m.rightDriverName ? (
        <div className="flex items-center px-3 py-1.5 min-h-[34px]" style={{ background: m.winnerSide === 'RIGHT' ? 'var(--emerald-soft)' : undefined }}>
          <span className="text-[12.5px] font-semibold flex-1 truncate" style={{ color: m.winnerSide === 'RIGHT' ? 'var(--emerald)' : undefined }}>
            {m.winnerSide === 'RIGHT' && '🏆 '}{m.rightDriverName}
          </span>
          {fin && (fin.rightPool ?? 0) > 0 && (
            <span className="text-[10px] text-[color:var(--text-3)] tabular-nums ml-2">{brl(fin.rightPool)} · {(fin.rightPercent ?? 0).toFixed(0)}%</span>
          )}
          {!settled && (
            <button className="btn-icon ml-2" style={{ color: 'var(--accent)' }} disabled={busy === m.id}
              onClick={() => onSetOpponent(m)} title="Trocar rival"><I.Edit size={12}/></button>
          )}
        </div>
      ) : (
        <button className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] text-[12px] text-[color:var(--accent)]"
          onClick={() => onSetOpponent(m)}>
          <I.Target size={13}/> Definir rival (Top 20 da Lista)
        </button>
      )}

      {!settled && ready && (
        <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--border)' }}>
          <button className="text-[10px] font-bold py-1.5" disabled={busy === m.id} onClick={() => onToggleMarket(m)}
            style={{ background: m.marketOpen ? 'var(--accent-soft)' : 'var(--emerald-soft)', color: m.marketOpen ? 'var(--accent)' : 'var(--emerald)' }}>
            {m.marketOpen ? '⏸ Fechar mercado' : '🚀 Abrir mercado'}
          </button>
          <button className="text-[10px] font-bold py-1.5" onClick={() => onSettle(m)} style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>🏆 Definir vencedor</button>
        </div>
      )}
      {settled && (
        <button className="w-full text-[10px] font-bold py-1.5 border-t border-[color:var(--border)]" disabled={busy === m.id}
          onClick={() => onReopen(m)} style={{ background: 'var(--surface-3)', color: '#ff7585' }}>
          {busy === m.id ? 'Reabrindo…' : '↺ Reembolsar e reabrir'}
        </button>
      )}
    </div>
  );
}

function OpponentModal({ matchup, onClose, onSaved }: { matchup: Matchup; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = React.useState('');
  const [nickname, setNickname] = React.useState('');
  const [hits, setHits] = React.useState<DriverHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [selected, setSelected] = React.useState<DriverHit | null>(null);
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  React.useEffect(() => {
    if (selected) return;
    const q = name.trim();
    if (q.length < 2) { setHits([]); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      api.get<DriverHit[]>(ENDPOINTS.SHARK_TANK.driverSearch(q))
        .then((r) => { if (alive) setHits(r); })
        .catch(() => { if (alive) setHits([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [name, selected]);

  const pick = (h: DriverHit) => {
    setSelected(h);
    setName(h.name);
    if (!nickname && h.nickname) setNickname(h.nickname);
    setHits([]);
  };

  const submit = async () => {
    if (!name.trim()) { push({ title: 'Informe o nome do rival', tone: 'rose' }); return; }
    setBusy(true);
    try {
      await api.patch(ENDPOINTS.SHARK_TANK.matchups.setOpponent(matchup.id), {
        ...(selected ? { driverId: selected.driverId } : { driverName: name.trim() }),
        driverNickname: nickname.trim() || undefined,
      });
      push({ title: 'Rival definido', tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  const chave = CHAVES[matchup.order - 1] ?? '?';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-4 sm:p-6 w-full max-w-sm">
        <div className="font-display text-[18px] font-bold mb-1">Definir rival</div>
        <div className="text-[12px] text-[color:var(--text-3)] mb-4">
          Desafio {matchup.order} · Finalista da Chave {chave} vs Top 20 da Lista
        </div>

        <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nome do rival</label>
        <div className="relative mt-1">
          <input className="input" autoFocus value={name} placeholder="Digite nome ou sobrenome…"
            onChange={(e) => { setName(e.target.value); if (selected) setSelected(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (selected || !hits.length)) void submit(); }}/>
          {!selected && (name.trim().length >= 2) && (hits.length > 0 || searching) && (
            <div className="absolute z-10 left-0 right-0 mt-1 surface-elev p-1 max-h-56 overflow-auto" style={{ borderRadius: 10 }}>
              {searching && hits.length === 0 && <div className="px-2 py-2 text-[12px] text-[color:var(--text-3)]">Buscando…</div>}
              {hits.map((h) => (
                <button key={h.driverId} onClick={() => pick(h)}
                  className="w-full text-left px-2 py-1.5 rounded-[8px] hover:bg-[color:var(--surface-2)] flex items-center gap-2">
                  <span className="flex-1 truncate text-[12.5px] font-medium">{h.name}</span>
                  {(h.nickname || h.team) && (
                    <span className="text-[10.5px] text-[color:var(--text-3)] truncate">{h.nickname ?? h.team}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {selected ? (
          <div className="mt-2 flex items-center gap-2 text-[12px] surface-2 p-2" style={{ borderRadius: 8 }}>
            <I.Check size={14} style={{ color: 'var(--emerald)' }}/>
            <span className="flex-1">Piloto já cadastrado{selected.team ? ` · ${selected.team}` : ''}</span>
            <button className="text-[11px] text-[color:var(--accent)]" onClick={() => setSelected(null)}>trocar</button>
          </div>
        ) : name.trim().length >= 2 && !searching ? (
          <div className="mt-2 text-[11.5px] text-[color:var(--text-3)]">
            Sem cadastro encontrado — será criado um novo piloto.
          </div>
        ) : null}

        <div className="mt-3">
          <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Apelido</label>
          <input className="input mt-1" value={nickname} placeholder="Como o piloto é conhecido (opcional)"
            onChange={(e) => setNickname(e.target.value)}/>
        </div>

        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Salvando…</> : <><I.Check size={14}/> Definir rival</>}
          </button>
        </div>
      </div>
    </div>
  );
}
