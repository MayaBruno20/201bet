'use client';

/**
 * Painel facilitado do Armageddon ELIMINATION_144 (144 pilotos, 5 chaves → Top 32
 * → campeão + 3º lugar). Três abas:
 *  - Cadastro: 144 pilotos nas chaves A-E (add manual) + "Gerar 1º sorteio".
 *  - Auditoria: sessão dedicada (pote/volume, abrir/fechar/auditar, abrir todos).
 *  - 2º Sorteio: arrasta-e-solta dos 32 classificados no chaveamento final.
 */

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Card, SectionTitle } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm } from '@admin/components/ui/confirm';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';
import { MultiMarketManager } from './multi-market-manager';

// Estrutura das chaves do 1º sorteio (espelha FIRST_DRAW_KEYS do backend).
const KEYS: Array<{ key: string; size: number; qualifiers: number }> = [
  { key: 'A', size: 32, qualifiers: 4 },
  { key: 'B', size: 28, qualifiers: 7 },
  { key: 'C', size: 28, qualifiers: 7 },
  { key: 'D', size: 28, qualifiers: 7 },
  { key: 'E', size: 28, qualifiers: 7 },
];
const SECOND_DRAW_SIZE = 32;

type RosterEntry = {
  id: string;
  bracketKey: string | null;
  position: number;
  driverId: string;
  driverName: string;
  driverTeam?: string | null;
  fromListId?: string | null;
  fromAreaCode?: number | null;
};

type DriverHit = {
  driverId: string;
  name: string;
  team: string | null;
  lists: Array<{ listId: string; areaCode: number; listName: string; position: number }>;
};
type ListOption = { id: string; areaCode: number; name: string };

type Matchup = {
  id: string;
  roundNumber: number;
  order: number;
  stage: 'FIRST_DRAW' | 'SECOND_DRAW' | null;
  bracketKey: string | null;
  nextMatchupId: string | null;
  isThirdPlace: boolean;
  isFinal: boolean;
  leftDriverId: string | null;
  rightDriverId: string | null;
  leftDriverName: string | null;
  rightDriverName: string | null;
  winnerSide: 'LEFT' | 'RIGHT' | null;
  marketOpen: boolean;
  duelId: string | null;
  settledAt: string | null;
};

type Detail = {
  id: string;
  name: string;
  status: string;
  bracketType: string;
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

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function ArmageddonEliminationDetail({ eventId, onChanged }: { eventId: string; onChanged?: () => void }) {
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [fin, setFin] = React.useState<FinancialSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<'cadastro' | 'auditoria' | 'segundo' | 'mercados'>('cadastro');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState<{ bracketKey: string; position: number } | null>(null);
  const [settleMatchup, setSettleMatchup] = React.useState<Matchup | null>(null);
  const { push } = useToast();
  const confirm = useConfirm();

  // silent=true → atualiza os dados SEM piscar o skeleton (usado após cada ação,
  // pra auditoria não "recarregar a página" toda hora).
  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const d = await api.get<Detail>(ENDPOINTS.ARMAGEDDON.detail(eventId));
      setDetail(d);
      if (d.matchups.length > 0) {
        try { setFin(await api.get<FinancialSummary>(ENDPOINTS.ARMAGEDDON.financialSummary(eventId))); }
        catch { /* resumo financeiro é best-effort */ }
      }
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { if (!opts?.silent) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);
  React.useEffect(() => { void load(); }, [load]);

  const firstDraw = React.useMemo(() => (detail?.matchups ?? []).filter((m) => m.stage === 'FIRST_DRAW'), [detail]);
  const secondDraw = React.useMemo(() => (detail?.matchups ?? []).filter((m) => m.stage === 'SECOND_DRAW'), [detail]);
  const qualifiers = React.useMemo(() => {
    // Classificados = vencedores dos embates terminais (nextMatchupId null) do 1º sorteio.
    return firstDraw
      .filter((m) => m.nextMatchupId === null && m.winnerSide)
      .map((m) => {
        const driverId = m.winnerSide === 'LEFT' ? m.leftDriverId : m.rightDriverId;
        const driverName = m.winnerSide === 'LEFT' ? m.leftDriverName : m.rightDriverName;
        return driverId ? { driverId, driverName: driverName ?? '?', bracketKey: m.bracketKey } : null;
      })
      .filter((q): q is { driverId: string; driverName: string; bracketKey: string | null } => !!q);
  }, [firstDraw]);
  const firstDrawComplete = firstDraw.length > 0 && qualifiers.length === SECOND_DRAW_SIZE;

  const generateFirstDraw = async () => {
    const ok = await confirm({
      title: 'Gerar 1º sorteio (5 chaves)?',
      body: 'Vai montar as árvores de eliminação das chaves A–E com base nos pilotos cadastrados. Posições vazias ficam sem piloto.',
      tone: 'info', confirmLabel: 'Gerar 1º sorteio', icon: 'Sparkles',
    });
    if (!ok) return;
    setBusy('gen1');
    try {
      await api.post(ENDPOINTS.ARMAGEDDON.generateFirstDraw(eventId));
      push({ title: '1º sorteio gerado', tone: 'emerald' });
      setTab('auditoria');
      await load(); onChanged?.();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const clearKeys = async () => {
    const ok = await confirm({
      title: 'Refazer chaves?',
      body: 'Apaga todos os embates gerados (1º e 2º sorteio) para sortear de novo. Os pilotos cadastrados ficam intactos. Só funciona se nenhum embate foi auditado e nenhum mercado está aberto.',
      tone: 'warning', confirmLabel: 'Refazer chaves', icon: 'Bolt',
    });
    if (!ok) return;
    setBusy('clear');
    try {
      await api.post(ENDPOINTS.ARMAGEDDON.clearKeys(eventId));
      push({ title: 'Chaves zeradas', body: 'Pronto para gerar de novo.', tone: 'amber' });
      setTab('cadastro');
      await load(); onChanged?.();
    } catch (e) { push({ title: 'Não foi possível refazer', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const resetEvent = async () => {
    // Confirmação DUPLA — esta operação mexe em dinheiro (estorna apostas).
    const ok1 = await confirm({
      title: 'Reiniciar o evento inteiro?',
      body: 'A chave volta ao estado original (1º sorteio regerado) e TODAS as apostas são estornadas: liquidadas são reembolsadas (estorno do pagamento), abertas são devolvidas. Os pilotos cadastrados ficam intactos.',
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
      const r = await api.post<{ refunded: number; voided: number }>(ENDPOINTS.ARMAGEDDON.resetEvent(eventId));
      push({ title: 'Evento reiniciado', body: `${r.refunded} mercado(s) estornado(s), ${r.voided} anulado(s). Chave regenerada.`, tone: 'emerald' });
      setTab('auditoria');
      await load(); onChanged?.();
    } catch (e) { push({ title: 'Erro ao reiniciar', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const generateSecondDraw = async () => {
    setBusy('gen2');
    try {
      await api.post(ENDPOINTS.ARMAGEDDON.generateSecondDraw(eventId));
      push({ title: '2º sorteio gerado — posicione os 32', tone: 'emerald' });
      setTab('segundo');
      await load(); onChanged?.();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const openMarkets = async (opts: MarketScope, busyKey: string) => {
    setBusy(busyKey);
    try {
      const r = await api.post<{ opened: number; total: number }>(ENDPOINTS.ARMAGEDDON.openAllReady(eventId, opts));
      push({ title: `${r.opened}/${r.total} mercado(s) aberto(s)`, tone: 'emerald' });
      await load({ silent: true });
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };
  const closeMarkets = async (opts: MarketScope, busyKey: string) => {
    setBusy(busyKey);
    try {
      const r = await api.post<{ closed: number; total: number }>(ENDPOINTS.ARMAGEDDON.closeAllOpen(eventId, opts));
      push({ title: `${r.closed}/${r.total} mercado(s) fechado(s)`, tone: 'amber' });
      await load({ silent: true });
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const toggleMarket = async (m: Matchup) => {
    setBusy(m.id);
    try {
      await api.patch(ENDPOINTS.ARMAGEDDON.matchups.toggleMarket(m.id), { open: !m.marketOpen });
      push({ title: m.marketOpen ? 'Mercado fechado' : 'Mercado aberto', tone: m.marketOpen ? 'amber' : 'emerald' });
      await load({ silent: true });
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const removeRoster = async (r: RosterEntry) => {
    setBusy(r.id);
    try {
      await api.del(ENDPOINTS.ARMAGEDDON.roster.delete(eventId, r.id));
      await load({ silent: true });
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  if (loading) return <Card className="p-12 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</Card>;
  if (!detail) return null;

  const rosterCount = detail.roster.length;
  const finByMatchup = new Map((fin?.matchups ?? []).map((m) => [m.id, m]));

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setTab('cadastro')} className={`tab ${tab === 'cadastro' ? 'active' : ''}`}>
            Cadastro <span className="text-[color:var(--text-4)]">({rosterCount}/144)</span>
          </button>
          <button onClick={() => setTab('auditoria')} className={`tab ${tab === 'auditoria' ? 'active' : ''}`}>
            Auditoria <span className="text-[color:var(--text-4)]">({firstDraw.length + secondDraw.length})</span>
          </button>
          <button onClick={() => setTab('segundo')} className={`tab ${tab === 'segundo' ? 'active' : ''}`}>
            2º Sorteio {firstDrawComplete && secondDraw.length === 0 && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full" style={{ background: 'var(--emerald)' }}/>}
          </button>
          <button onClick={() => setTab('mercados')} className={`tab ${tab === 'mercados' ? 'active' : ''}`}>
            Multi-Mercados
          </button>
          {(firstDraw.length > 0 || secondDraw.length > 0) && (
            <button className="btn btn-ghost focusable ml-auto text-[12px]" style={{ color: '#ff7585' }}
              onClick={resetEvent} disabled={busy === 'reset'}>
              {busy === 'reset' ? <><span className="pulse-dot"/> Reiniciando…</> : <><I.Trash size={13}/> Reiniciar evento</>}
            </button>
          )}
        </div>
      </Card>

      {tab === 'cadastro' && (
        <CadastroTab
          detail={detail} busy={busy} firstDrawGenerated={firstDraw.length > 0}
          onAdd={(bracketKey, position) => setAddOpen({ bracketKey, position })}
          onRemove={removeRoster} onGenerate={generateFirstDraw} onClearKeys={clearKeys}
        />
      )}

      {tab === 'auditoria' && (
        <AuditoriaTab
          fin={fin} finByMatchup={finByMatchup} busy={busy}
          firstDraw={firstDraw} secondDraw={secondDraw}
          onToggleMarket={toggleMarket} onSettle={(m) => setSettleMatchup(m)}
          onOpen={openMarkets} onClose={closeMarkets}
        />
      )}

      {tab === 'segundo' && (
        <SegundoSorteioTab
          eventId={eventId} secondDraw={secondDraw} qualifiers={qualifiers}
          firstDrawComplete={firstDrawComplete} busy={busy}
          onGenerate={generateSecondDraw} onSaved={() => { void load(); onChanged?.(); }}
        />
      )}

      {tab === 'mercados' && (
        <MultiMarketManager
          armageddonEventId={eventId}
          eventName={detail.name}
          roster={detail.roster.map((r) => ({ driverId: r.driverId, name: r.driverName }))}
        />
      )}

      {addOpen && (
        <AddPilotModal
          eventId={eventId} bracketKey={addOpen.bracketKey} position={addOpen.position}
          onClose={() => setAddOpen(null)}
          onSaved={() => { setAddOpen(null); void load({ silent: true }); }}
        />
      )}

      {settleMatchup && (
        <SettleModal
          matchup={settleMatchup} onClose={() => setSettleMatchup(null)}
          onSaved={() => { setSettleMatchup(null); void load({ silent: true }); onChanged?.(); }}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Cadastro ───────────────────────── */

function CadastroTab({ detail, busy, firstDrawGenerated, onAdd, onRemove, onGenerate, onClearKeys }: {
  detail: Detail; busy: string | null; firstDrawGenerated: boolean;
  onAdd: (bracketKey: string, position: number) => void;
  onRemove: (r: RosterEntry) => void; onGenerate: () => void; onClearKeys: () => void;
}) {
  const byKey = new Map<string, Map<number, RosterEntry>>();
  for (const k of KEYS) byKey.set(k.key, new Map());
  for (const r of detail.roster) {
    if (r.bracketKey && byKey.has(r.bracketKey)) byKey.get(r.bracketKey)!.set(r.position, r);
  }
  const total = detail.roster.length;

  return (
    <Card className="p-5">
      <SectionTitle
        title="Cadastro nas chaves" sub="Adicione os 144 pilotos nas chaves A–E. Clique numa posição vazia para cadastrar."
        action={
          <div className="flex items-center gap-2">
            {firstDrawGenerated && (
              <button className="btn btn-ghost focusable" style={{ color: 'var(--accent)' }} onClick={onClearKeys} disabled={busy === 'clear'}>
                {busy === 'clear' ? <><span className="pulse-dot"/> Refazendo…</> : <><I.Bolt size={14}/> Refazer chaves</>}
              </button>
            )}
            <button className="btn btn-primary focusable" onClick={onGenerate} disabled={busy === 'gen1' || total < 2}>
              {busy === 'gen1' ? <><span className="pulse-dot"/> Gerando…</> : <><I.Bolt size={14}/> Gerar 1º sorteio</>}
            </button>
          </div>
        }
      />
      {firstDrawGenerated && (
        <div className="rounded-[10px] p-2.5 mb-3 text-[11.5px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          ⚠ O 1º sorteio já foi gerado. Recadastrar e gerar de novo só é permitido enquanto nenhum embate foi auditado.
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {KEYS.map((k) => {
          const slots = byKey.get(k.key)!;
          const filled = slots.size;
          return (
            <div key={k.key} className="surface-2 p-3" style={{ borderRadius: 12 }}>
              <div className="flex items-center justify-between mb-2">
                <div className="font-display text-[14px] font-bold">Chave {k.key}</div>
                <div className="text-[11px] text-[color:var(--text-3)]">
                  {filled}/{k.size} · classifica {k.qualifiers}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {Array.from({ length: k.size }, (_, i) => i + 1).map((pos) => {
                  const r = slots.get(pos);
                  return (
                    <div key={pos}
                      className="flex items-center gap-1.5 px-2 py-1 text-[11.5px]"
                      style={{ borderRadius: 8, background: r ? 'var(--surface-3)' : 'transparent', border: '1px solid ' + (r ? 'var(--border)' : 'var(--border-subtle, var(--border))') }}>
                      <span className="text-[color:var(--text-4)] w-5 tabular-nums">{pos}</span>
                      {r ? (
                        <>
                          <span className="flex-1 truncate font-medium">
                            {r.driverName}
                            {r.fromAreaCode != null && (
                              <span className="text-[color:var(--text-4)] font-normal"> · {String(r.fromAreaCode).padStart(2, '0')}</span>
                            )}
                          </span>
                          <button className="btn-icon" style={{ color: '#ff7585' }} disabled={busy === r.id}
                            onClick={() => onRemove(r)} title="Remover"><I.X size={12}/></button>
                        </>
                      ) : (
                        <button className="flex-1 text-left text-[color:var(--text-4)] hover:text-[color:var(--accent)]"
                          onClick={() => onAdd(k.key, pos)}>+ adicionar</button>
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
  const [hits, setHits] = React.useState<DriverHit[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [selected, setSelected] = React.useState<DriverHit | null>(null);
  const [allLists, setAllLists] = React.useState<ListOption[]>([]);
  const [chosenListId, setChosenListId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  // Listas Brasil para o caso de piloto novo / piloto sem lista.
  React.useEffect(() => {
    api.get<Array<{ id: string; areaCode: number; name: string }>>(ENDPOINTS.BRAZIL_LISTS.list)
      .then((ls) => setAllLists(ls.map((l) => ({ id: l.id, areaCode: l.areaCode, name: l.name }))))
      .catch(() => undefined);
  }, []);

  // Busca debounced enquanto digita (só se ainda não selecionou ninguém).
  React.useEffect(() => {
    if (selected) return;
    const q = name.trim();
    if (q.length < 2) { setHits([]); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      api.get<DriverHit[]>(ENDPOINTS.ARMAGEDDON.driverSearch(q))
        .then((r) => { if (alive) setHits(r); })
        .catch(() => { if (alive) setHits([]); })
        .finally(() => { if (alive) setSearching(false); });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [name, selected]);

  const pick = (h: DriverHit) => {
    setSelected(h);
    setName(h.name);
    setHits([]);
    setChosenListId(h.lists[0]?.listId ?? '');
  };
  const clearPick = () => { setSelected(null); setChosenListId(''); };

  // Piloto existente com lista(s) → usa a lista do cadastro; senão pede manualmente.
  const hasOwnLists = !!selected && selected.lists.length > 0;

  const resolveList = (): { fromListId?: string; fromAreaCode?: number } => {
    if (hasOwnLists) {
      const l = selected!.lists.find((x) => x.listId === chosenListId) ?? selected!.lists[0];
      return { fromListId: l?.listId, fromAreaCode: l?.areaCode };
    }
    const l = allLists.find((x) => x.id === chosenListId);
    return { fromListId: l?.id, fromAreaCode: l?.areaCode };
  };

  const submit = async () => {
    if (!name.trim()) { push({ title: 'Informe o nome do piloto', tone: 'rose' }); return; }
    const list = resolveList();
    if (list.fromAreaCode == null) {
      push({ title: 'Selecione a lista (DDD) do piloto', tone: 'rose' }); return;
    }
    setBusy(true);
    try {
      await api.post(ENDPOINTS.ARMAGEDDON.roster.upsert(eventId), {
        ...(selected ? { driverId: selected.driverId } : { driverName: name.trim() }),
        bracketKey, position,
        fromListId: list.fromListId, fromAreaCode: list.fromAreaCode,
      });
      push({ title: 'Piloto cadastrado', tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-6 w-full max-w-sm">
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
                  <span className="text-[10.5px] text-[color:var(--text-3)] truncate">
                    {h.lists.length ? h.lists.map((l) => `DDD ${String(l.areaCode).padStart(2, '0')}`).join(', ') : 'sem lista'}
                  </span>
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
            Sem cadastro encontrado — será criado um novo piloto. Informe a lista abaixo.
          </div>
        ) : null}

        {/* Lista do piloto */}
        <div className="mt-3">
          <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Lista (DDD)</label>
          {hasOwnLists ? (
            selected!.lists.length === 1 ? (
              <div className="input mt-1 flex items-center" style={{ pointerEvents: 'none' }}>
                DDD {String(selected!.lists[0].areaCode).padStart(2, '0')} — {selected!.lists[0].listName}
              </div>
            ) : (
              <select className="input mt-1" value={chosenListId} onChange={(e) => setChosenListId(e.target.value)}>
                {selected!.lists.map((l) => (
                  <option key={l.listId} value={l.listId}>DDD {String(l.areaCode).padStart(2, '0')} — {l.listName}</option>
                ))}
              </select>
            )
          ) : (
            <select className="input mt-1" value={chosenListId} onChange={(e) => setChosenListId(e.target.value)}>
              <option value="">Selecione a lista…</option>
              {allLists.map((l) => (
                <option key={l.id} value={l.id}>DDD {String(l.areaCode).padStart(2, '0')} — {l.name}</option>
              ))}
            </select>
          )}
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

/* ───────────────────────── Auditoria ───────────────────────── */

function keyStats(ms: Matchup[]) {
  const total = ms.length;
  const settled = ms.filter((m) => m.winnerSide).length;
  const open = ms.filter((m) => m.marketOpen && !m.winnerSide).length;
  const ready = ms.filter((m) => !m.winnerSide && !m.marketOpen && m.leftDriverId && m.rightDriverId).length;
  return { total, settled, open, ready, done: total > 0 && settled === total };
}

type MarketScope = { bracketKey?: string; roundNumber?: number; stage?: string };

function AuditoriaTab({ fin, finByMatchup, busy, firstDraw, secondDraw, onToggleMarket, onSettle, onOpen, onClose }: {
  fin: FinancialSummary | null; finByMatchup: Map<string, FinMatchup>; busy: string | null;
  firstDraw: Matchup[]; secondDraw: Matchup[];
  onToggleMarket: (m: Matchup) => void; onSettle: (m: Matchup) => void;
  onOpen: (opts: MarketScope, busyKey: string) => void; onClose: (opts: MarketScope, busyKey: string) => void;
}) {
  // chaves presentes no 1º sorteio
  const chaves = KEYS.map((k) => ({ ...k, matchups: firstDraw.filter((m) => m.bracketKey === k.key) })).filter((k) => k.matchups.length);

  // Expandir por padrão a 1ª chave com trabalho pendente; manter o estado do usuário entre refetches.
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    const firstPending = chaves.find((k) => !keyStats(k.matchups).done);
    const init = new Set<string>();
    if (firstPending) init.add(firstPending.key); else if (chaves[0]) init.add(chaves[0].key);
    if (secondDraw.length) init.add('SECOND');
    return init;
  });
  const toggle = (key: string) => setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  if (firstDraw.length === 0 && secondDraw.length === 0) {
    return <Card className="p-8 text-center text-[12.5px] text-[color:var(--text-3)]">
      Nenhum embate ainda. Gere o 1º sorteio na aba Cadastro.
    </Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <SectionTitle title="Sessão de auditoria" sub="Abra os mercados rodada a rodada (Chave A → E). Feche por chave quando precisar."/>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard label="Pote total (volume)" value={brl(fin?.totalPool ?? 0)} accent="emerald"/>
          <StatCard label="Passadas" value={String(fin?.totalMatchups ?? (firstDraw.length + secondDraw.length))}/>
          <StatCard label="Mercados abertos" value={String(fin?.openMarkets ?? 0)} accent="accent"/>
          <StatCard label="Auditados" value={`${fin?.settledCount ?? 0}/${fin?.totalMatchups ?? (firstDraw.length + secondDraw.length)}`}/>
        </div>
      </Card>

      {chaves.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-display text-[15px] font-bold">1º Sorteio — 5 chaves</div>
            <div className="text-[11px] text-[color:var(--text-3)]">Fluxo: Chave A → B → C → D → E</div>
          </div>
          <div className="space-y-2">
            {chaves.map((k) => {
              const st = keyStats(k.matchups);
              const isOpen = expanded.has(k.key);
              const closeBusy = busy === `close-${k.key}`;
              return (
                <div key={k.key} className="surface-2" style={{ borderRadius: 12, border: '1px solid ' + (st.done ? 'var(--emerald)' : st.open ? 'var(--accent)' : 'var(--border)') }}>
                  <div className="flex items-center gap-2 px-3 py-2.5">
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
                      <BracketKeyBlock title="" scope={k.key} matchups={k.matchups} finByMatchup={finByMatchup} busy={busy}
                        onToggleMarket={onToggleMarket} onSettle={onSettle}
                        onOpenRound={(rn) => onOpen({ bracketKey: k.key, roundNumber: rn, stage: 'FIRST_DRAW' }, `open-${k.key}-${rn}`)}/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {secondDraw.length > 0 && (() => {
        const sd = keyStats(secondDraw);
        const closeBusy = busy === 'close-S';
        return (
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="font-display text-[15px] font-bold">2º Sorteio — Top 32</div>
              <div className="flex items-center gap-2">
                {sd.open > 0 && (
                  <button className="btn btn-ghost focusable text-[11px]" style={{ color: 'var(--accent)' }}
                    onClick={() => onClose({ stage: 'SECOND_DRAW' }, 'close-S')} disabled={closeBusy}>
                    {closeBusy ? <><span className="pulse-dot"/> Fechando…</> : <>⏸ Fechar todos ({sd.open})</>}
                  </button>
                )}
                <button className="text-[12px] text-[color:var(--accent)]" onClick={() => toggle('SECOND')}>
                  {expanded.has('SECOND') ? 'recolher' : 'expandir'}
                </button>
              </div>
            </div>
            {expanded.has('SECOND') && (
              <BracketKeyBlock title="" scope="S" matchups={secondDraw} finByMatchup={finByMatchup} busy={busy}
                onToggleMarket={onToggleMarket} onSettle={onSettle}
                onOpenRound={(rn) => onOpen({ roundNumber: rn, stage: 'SECOND_DRAW' }, `open-S-${rn}`)}/>
            )}
          </Card>
        );
      })()}
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

function roundLabel(m: Matchup): string {
  if (m.isThirdPlace) return '🥉 3º lugar';
  if (m.isFinal) return '🏆 Final';
  if (m.stage === 'SECOND_DRAW') {
    // 32→16→8→4(semi)→final: rotula por tamanho.
    const map: Record<number, string> = { 1: 'Top 32', 2: 'Top 16', 3: 'Quartas', 4: 'Semifinal', 5: 'Final' };
    return map[m.roundNumber] ?? `Rodada ${m.roundNumber}`;
  }
  return `Rodada ${m.roundNumber}`;
}

function BracketKeyBlock({ title, scope, matchups, finByMatchup, busy, onToggleMarket, onSettle, onOpenRound }: {
  title: string; scope?: string; matchups: Matchup[]; finByMatchup: Map<string, FinMatchup>; busy: string | null;
  onToggleMarket: (m: Matchup) => void; onSettle: (m: Matchup) => void;
  onOpenRound?: (roundNumber: number) => void;
}) {
  const byRound = new Map<number, Matchup[]>();
  for (const m of matchups) { const a = byRound.get(m.roundNumber) ?? []; a.push(m); byRound.set(m.roundNumber, a); }
  const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);

  return (
    <div className="mb-4">
      {title && <div className="text-[12px] font-bold text-[color:var(--text-2)] mb-2">{title}</div>}
      {rounds.map((rn) => {
        const ms = (byRound.get(rn) ?? []).sort((a, b) => a.order - b.order);
        const ready = ms.filter((m) => !m.winnerSide && !m.marketOpen && m.leftDriverId && m.rightDriverId).length;
        const settled = ms.filter((m) => m.winnerSide).length;
        const openBusy = busy === `open-${scope ?? '?'}-${rn}`;
        return (
          <div key={rn} className="mb-3">
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">
                {roundLabel(ms[0])} <span className="text-[color:var(--text-4)] normal-case tracking-normal">· {settled}/{ms.length}</span>
              </div>
              {onOpenRound && ready > 0 && (
                <button className="text-[10px] font-bold px-2 py-1 rounded" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}
                  onClick={() => onOpenRound(rn)} disabled={openBusy}>
                  {openBusy ? 'Abrindo…' : `🚀 Abrir todos da rodada (${ready})`}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {ms.map((m) => <MatchupRow key={m.id} m={m} fin={finByMatchup.get(m.id)} busy={busy} onToggleMarket={onToggleMarket} onSettle={onSettle}/>)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MatchupRow({ m, fin, busy, onToggleMarket, onSettle }: {
  m: Matchup; fin?: FinMatchup; busy: string | null;
  onToggleMarket: (m: Matchup) => void; onSettle: (m: Matchup) => void;
}) {
  const settled = !!m.winnerSide;
  const ready = !!m.leftDriverId && !!m.rightDriverId;
  const borderColor = settled ? 'var(--emerald)' : m.marketOpen ? 'var(--accent)' : 'var(--border)';
  const Side = ({ side }: { side: 'LEFT' | 'RIGHT' }) => {
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
  };
  return (
    <div className="surface-2 overflow-hidden" style={{ borderRadius: 12, border: '1px solid ' + borderColor }}>
      {m.marketOpen && !settled && (
        <div className="px-2 py-0.5 text-center text-[9px] font-bold uppercase tracking-[0.14em]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>🟢 Mercado aberto</div>
      )}
      <Side side="LEFT"/>
      <div className="border-t border-[color:var(--border)]"/>
      <Side side="RIGHT"/>
      {!settled && ready && (
        <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--border)' }}>
          <button className="text-[10px] font-bold py-1.5" disabled={busy === m.id} onClick={() => onToggleMarket(m)}
            style={{ background: m.marketOpen ? 'var(--accent-soft)' : 'var(--emerald-soft)', color: m.marketOpen ? 'var(--accent)' : 'var(--emerald)' }}>
            {m.marketOpen ? '⏸ Fechar' : '🚀 Abrir'}
          </button>
          <button className="text-[10px] font-bold py-1.5" onClick={() => onSettle(m)} style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>🏆 Auditar</button>
        </div>
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
      await api.post(ENDPOINTS.ARMAGEDDON.matchups.settle(matchup.id), { winnerSide: winner, notes: notes.trim() || undefined });
      push({ title: 'Auditado', body: `Vencedor: ${winner === 'LEFT' ? matchup.leftDriverName : matchup.rightDriverName}`, tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-6 w-full max-w-md">
        <div className="font-display text-[18px] font-bold mb-1">Auditar vencedor</div>
        <div className="text-[12px] text-[color:var(--text-3)] mb-3">{roundLabel(matchup)} · #{matchup.order}</div>
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

/* ───────────────────── 2º Sorteio (arrasta-e-solta) ───────────────────── */

function SegundoSorteioTab({ eventId, secondDraw, qualifiers, firstDrawComplete, busy, onGenerate, onSaved }: {
  eventId: string; secondDraw: Matchup[];
  qualifiers: Array<{ driverId: string; driverName: string; bracketKey: string | null }>;
  firstDrawComplete: boolean; busy: string | null; onGenerate: () => void; onSaved: () => void;
}) {
  // Round-1 do 2º sorteio = 16 embates (slots para os 32 classificados).
  const round1 = React.useMemo(() => secondDraw.filter((m) => m.roundNumber === 1).sort((a, b) => a.order - b.order), [secondDraw]);

  // placement: matchupId -> { left, right } driverId
  const [placement, setPlacement] = React.useState<Record<string, { left: string | null; right: string | null }>>({});
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const { push } = useToast();

  // Inicializa o placement a partir do que já está salvo no backend.
  React.useEffect(() => {
    const init: Record<string, { left: string | null; right: string | null }> = {};
    for (const m of round1) init[m.id] = { left: m.leftDriverId, right: m.rightDriverId };
    setPlacement(init);
  }, [secondDraw]); // eslint-disable-line react-hooks/exhaustive-deps

  const placedIds = new Set<string>();
  Object.values(placement).forEach((p) => { if (p.left) placedIds.add(p.left); if (p.right) placedIds.add(p.right); });
  const available = qualifiers.filter((q) => !placedIds.has(q.driverId));
  const nameById = new Map(qualifiers.map((q) => [q.driverId, q.driverName]));

  const assign = (matchupId: string, side: 'left' | 'right', driverId: string) => {
    setPlacement((prev) => {
      const next: typeof prev = {};
      // remove o piloto de qualquer slot anterior
      for (const [mid, p] of Object.entries(prev)) {
        next[mid] = { left: p.left === driverId ? null : p.left, right: p.right === driverId ? null : p.right };
      }
      next[matchupId] = { ...next[matchupId], [side]: driverId } as { left: string | null; right: string | null };
      return next;
    });
  };
  const clearSlot = (matchupId: string, side: 'left' | 'right') =>
    setPlacement((prev) => ({ ...prev, [matchupId]: { ...prev[matchupId], [side]: null } }));

  const autoFill = () => {
    // Preenche em ordem: distribui os classificados disponíveis nos slots vazios.
    setPlacement((prev) => {
      const next = { ...prev };
      const used = new Set<string>();
      Object.values(next).forEach((p) => { if (p.left) used.add(p.left); if (p.right) used.add(p.right); });
      const pool = qualifiers.filter((q) => !used.has(q.driverId)).map((q) => q.driverId);
      let i = 0;
      for (const m of round1) {
        const slot = next[m.id] ?? { left: null, right: null };
        if (!slot.left && i < pool.length) slot.left = pool[i++];
        if (!slot.right && i < pool.length) slot.right = pool[i++];
        next[m.id] = slot;
      }
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const slots = round1.map((m) => ({ matchupId: m.id, leftDriverId: placement[m.id]?.left ?? null, rightDriverId: placement[m.id]?.right ?? null }));
      await api.post(ENDPOINTS.ARMAGEDDON.secondDrawLayout(eventId), { slots });
      push({ title: 'Chaveamento salvo', tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setSaving(false); }
  };

  if (secondDraw.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="font-display text-[15px] font-semibold">2º Sorteio — Top 32</div>
        <div className="text-[12.5px] text-[color:var(--text-3)] mt-1 max-w-md mx-auto">
          {firstDrawComplete
            ? 'O 1º sorteio terminou — os 32 classificados estão prontos. Gere o chaveamento final para posicioná-los.'
            : 'Disponível quando os 32 classificados do 1º sorteio estiverem decididos.'}
        </div>
        <button className="btn btn-primary mt-4 mx-auto" onClick={onGenerate} disabled={!firstDrawComplete || busy === 'gen2'}>
          {busy === 'gen2' ? <><span className="pulse-dot"/> Gerando…</> : <><I.Sparkles size={14}/> Gerar 2º sorteio</>}
        </button>
      </Card>
    );
  }

  const allPlaced = placedIds.size === SECOND_DRAW_SIZE;
  const locked = round1.some((m) => m.marketOpen || m.winnerSide);

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-4">
        <Card className="p-4">
          <SectionTitle title="Classificados" sub={`${available.length} sem posição`}
            action={<button className="btn btn-ghost focusable" onClick={autoFill} disabled={locked}><I.Bolt size={13}/> Auto</button>}/>
          {locked && <div className="text-[11px] text-[color:var(--accent)] mb-2">Já há mercado aberto/auditado — chaveamento travado.</div>}
          <div className="flex flex-wrap gap-1.5">
            {available.map((q) => (
              <div key={q.driverId} draggable={!locked} onDragStart={() => setDragId(q.driverId)} onDragEnd={() => setDragId(null)}
                className="px-2 py-1 text-[11.5px] font-medium cursor-grab active:cursor-grabbing"
                style={{ borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border)', opacity: dragId === q.driverId ? 0.4 : 1 }}>
                {q.driverName}{q.bracketKey && <span className="text-[color:var(--text-4)]"> · {q.bracketKey}</span>}
              </div>
            ))}
            {available.length === 0 && <div className="text-[12px] text-[color:var(--text-3)]">Todos posicionados ✓</div>}
          </div>
        </Card>
      </div>

      <div className="col-span-12 lg:col-span-8">
        <Card className="p-4">
          <SectionTitle title="Chaveamento do Top 32" sub="Arraste os classificados para os slots da 1ª rodada."
            action={
              <button className="btn btn-primary focusable" onClick={save} disabled={saving || locked}>
                {saving ? <><span className="pulse-dot"/> Salvando…</> : <><I.Check size={14}/> Salvar chaveamento {allPlaced ? '' : `(${placedIds.size}/32)`}</>}
              </button>
            }/>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {round1.map((m) => (
              <div key={m.id} className="surface-2 overflow-hidden" style={{ borderRadius: 10, border: '1px solid var(--border)' }}>
                {(['left', 'right'] as const).map((side, idx) => {
                  const driverId = placement[m.id]?.[side] ?? null;
                  return (
                    <div key={side}
                      onDragOver={(e) => { if (!locked && dragId) e.preventDefault(); }}
                      onDrop={() => { if (!locked && dragId) { assign(m.id, side, dragId); setDragId(null); } }}
                      className="flex items-center gap-2 px-2.5 py-1.5 min-h-[32px]"
                      style={{ borderTop: idx === 1 ? '1px solid var(--border)' : undefined, background: driverId ? undefined : 'var(--surface-1)' }}>
                      <span className="text-[9px] text-[color:var(--text-4)] w-3">{m.order * 2 - (side === 'left' ? 1 : 0)}</span>
                      <span className="flex-1 truncate text-[12px] font-medium" style={{ color: driverId ? undefined : 'var(--text-4)' }}>
                        {driverId ? nameById.get(driverId) ?? '?' : 'solte aqui'}
                      </span>
                      {driverId && !locked && (
                        <button className="btn-icon" style={{ color: '#ff7585' }} onClick={() => clearSlot(m.id, side)}><I.X size={11}/></button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
