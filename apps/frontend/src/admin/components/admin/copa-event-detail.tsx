'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Card, SectionTitle, StatusChip } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm } from '@admin/components/ui/confirm';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';

/* ───── Tipos do detalhe da Copa Categorias ───── */

export type CategoryCompetitor = {
  id: string;
  bracketId: string;
  carName?: string | null;
  carNumber?: string | null;
  qualifyingReaction?: string | number | null;
  qualifyingTrack?: string | number | null;
  qualifyingTotal?: string | number | null;
  driver: { id: string; name: string; nickname?: string | null; team?: string | null };
};

export type CategoryMatchup = {
  id: string;
  bracketId: string;
  roundNumber: number;
  position: number;
  isSuperFinal: boolean;
  status: 'PENDING' | 'COMPLETED' | 'INVALIDATED' | 'CANCELED';
  marketOpen: boolean;
  duelId: string | null;
  leftCompetitorId: string | null;
  rightCompetitorId: string | null;
  winnerSide: 'LEFT' | 'RIGHT' | null;
  settledAt: string | null;
};

export type CategoryBracket = {
  id: string;
  categoryEventId: string;
  category: string;
  size: number;
  competitors: CategoryCompetitor[];
  matchups: CategoryMatchup[];
};

export type CategoryEventDetail = {
  id: string;
  name: string;
  status: string;
  scheduledAt: string;
  endsAt: string | null;
  brackets: CategoryBracket[];
};

const CATEGORIES = [
  { value: 'ORIGINAL_10S', label: 'Original 10s' },
  { value: 'CAT_9S', label: '9s' },
  { value: 'CAT_8_5S', label: '8,5s' },
  { value: 'CAT_8S', label: '8s' },
  { value: 'CAT_7_5S', label: '7,5s' },
  { value: 'CAT_7S', label: '7s' },
  { value: 'CAT_6_5S', label: '6,5s' },
  { value: 'CAT_6S', label: '6s' },
  { value: 'CAT_5_5S', label: '5,5s' },
  { value: 'TUDOKIDA', label: 'TUDOKIDÁ' },
  { value: 'APRESENTACAO', label: 'Apresentação' },
];

const SUPER_FINAL_ROUND = 99;

function getRounds(size: number): number {
  return Math.max(1, Math.ceil(Math.log2(size)));
}

export function CopaEventDetail({ eventId, onChanged }: { eventId: string; onChanged?: () => void }) {
  const [detail, setDetail] = React.useState<CategoryEventDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeBracketId, setActiveBracketId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [showAddCategory, setShowAddCategory] = React.useState(false);
  const [showSuperFinal, setShowSuperFinal] = React.useState(false);
  const [auditMatchup, setAuditMatchup] = React.useState<CategoryMatchup | null>(null);
  const [auditWinnerSide, setAuditWinnerSide] = React.useState<'LEFT' | 'RIGHT'>('LEFT');
  const { push } = useToast();
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<CategoryEventDetail>(ENDPOINTS.CATEGORY_EVENTS.detail(eventId));
      setDetail(d);
      if (!activeBracketId && d.brackets.length > 0) {
        setActiveBracketId(d.brackets[0].id);
      }
    } catch (e) { push({ title: 'Erro ao carregar evento', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);
  React.useEffect(() => { void load(); }, [load]);

  const activeBracket = detail?.brackets.find((b) => b.id === activeBracketId) ?? null;

  const addCategory = async (category: string, size: number) => {
    setBusy('add-cat');
    try {
      await api.post(ENDPOINTS.CATEGORY_EVENTS.brackets.create(eventId), { category, size });
      push({ title: 'Categoria adicionada', tone: 'emerald' });
      setShowAddCategory(false);
      await load();
      onChanged?.();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const removeBracket = async (bracketId: string) => {
    const ok = await confirm({
      title: 'Excluir categoria do evento?',
      body: 'Inscritos e chaves desta categoria serão apagados em definitivo. Embates/apostas relacionados serão limpos.',
      tone: 'danger',
      confirmLabel: 'Excluir categoria',
      icon: 'Trash',
    });
    if (!ok) return;
    setBusy(bracketId);
    try {
      await api.del(ENDPOINTS.CATEGORY_EVENTS.brackets.delete(bracketId));
      push({ title: 'Categoria removida', tone: 'amber' });
      setActiveBracketId(null);
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const changeSize = async (bracketId: string, size: number) => {
    setBusy(bracketId);
    try {
      await api.patch(ENDPOINTS.CATEGORY_EVENTS.brackets.size(bracketId), { size });
      push({ title: 'Tamanho atualizado', tone: 'emerald' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const toggleMarket = async (m: CategoryMatchup, open: boolean) => {
    setBusy(m.id);
    try {
      await api.patch(ENDPOINTS.CATEGORY_EVENTS.matchups.toggleMarket(m.id), { open });
      push({ title: open ? 'Apostas abertas' : 'Apostas fechadas', tone: open ? 'emerald' : 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const cancelMatchup = async (m: CategoryMatchup) => {
    const ok = await confirm({
      title: 'Cancelar embate?',
      body: 'Apostas em aberto serão reembolsadas automaticamente.',
      tone: 'danger',
      confirmLabel: 'Cancelar embate',
      icon: 'AlertTriangle',
    });
    if (!ok) return;
    setBusy(m.id);
    try {
      await api.post(ENDPOINTS.CATEGORY_EVENTS.matchups.cancel(m.id));
      push({ title: 'Embate cancelado', tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const settleMatchup = async () => {
    if (!auditMatchup) return;
    setBusy(auditMatchup.id);
    try {
      await api.post(ENDPOINTS.CATEGORY_EVENTS.matchups.settle(auditMatchup.id), { winnerSide: auditWinnerSide });
      push({ title: 'Vencedor auditado', body: `Lado ${auditWinnerSide}`, tone: 'emerald' });
      setAuditMatchup(null);
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  if (loading) return <Card className="p-12 text-center text-[13px] text-[color:var(--text-3)]">Carregando detalhes…</Card>;
  if (!detail) return null;

  return (
    <div className="space-y-5">
      {/* Tabs de categorias do evento */}
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          {detail.brackets.map((b) => {
            const meta = CATEGORIES.find((c) => c.value === b.category);
            const isActive = activeBracketId === b.id;
            return (
              <button key={b.id} onClick={() => setActiveBracketId(b.id)} className={`tab ${isActive ? 'active' : ''}`}>
                {meta?.label ?? b.category} <span className="text-[color:var(--text-4)]">({b.competitors.length})</span>
              </button>
            );
          })}
          <button className="tab" onClick={() => setShowAddCategory(true)}>
            <I.Plus size={12}/> Categoria
          </button>
        </div>
      </Card>

      {!activeBracket && detail.brackets.length === 0 && (
        <Card className="p-12 text-center">
          <div className="w-12 h-12 rounded-[12px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)' }}>
            <I.Trophy size={20} style={{ color: 'var(--text-3)' }}/>
          </div>
          <div className="font-display text-[15px] font-semibold mt-3">Nenhuma categoria adicionada</div>
          <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">Clique em "+ Categoria" pra começar.</div>
        </Card>
      )}

      {activeBracket && (
        <BracketPanel
          bracket={activeBracket}
          eventId={eventId}
          onChanged={load}
          onShowSuperFinal={() => setShowSuperFinal(true)}
          onAuditMatchup={(m) => { setAuditMatchup(m); setAuditWinnerSide('LEFT'); }}
          onToggleMarket={toggleMarket}
          onCancelMatchup={cancelMatchup}
          onChangeSize={(size) => changeSize(activeBracket.id, size)}
          onRemoveBracket={() => removeBracket(activeBracket.id)}
          busy={busy}
        />
      )}

      {/* Modal: adicionar categoria */}
      {showAddCategory && (
        <AddCategoryModal
          onClose={() => setShowAddCategory(false)}
          existingCategories={detail.brackets.map((b) => b.category)}
          onSubmit={addCategory}
          busy={busy === 'add-cat'}
        />
      )}

      {/* Modal: super final */}
      {showSuperFinal && activeBracket && (
        <SuperFinalModal
          bracket={activeBracket}
          onClose={() => setShowSuperFinal(false)}
          onChanged={load}
        />
      )}

      {/* Modal: auditar vencedor de matchup */}
      {auditMatchup && activeBracket && (
        <AuditMatchupModal
          matchup={auditMatchup}
          bracket={activeBracket}
          winnerSide={auditWinnerSide}
          setWinnerSide={setAuditWinnerSide}
          onSubmit={settleMatchup}
          onClose={() => setAuditMatchup(null)}
          busy={busy === auditMatchup.id}
        />
      )}
    </div>
  );
}

/* ───── Painel do bracket selecionado ───── */

function BracketPanel({
  bracket, eventId: _eventId, onChanged, onShowSuperFinal, onAuditMatchup, onToggleMarket, onCancelMatchup, onChangeSize, onRemoveBracket, busy,
}: {
  bracket: CategoryBracket;
  eventId: string;
  onChanged: () => Promise<void> | void;
  onShowSuperFinal: () => void;
  onAuditMatchup: (m: CategoryMatchup) => void;
  onToggleMarket: (m: CategoryMatchup, open: boolean) => Promise<void>;
  onCancelMatchup: (m: CategoryMatchup) => Promise<void>;
  onChangeSize: (size: number) => Promise<void>;
  onRemoveBracket: () => Promise<void>;
  busy: string | null;
}) {
  const { push } = useToast();
  const [drag, setDrag] = React.useState<string | null>(null);

  const meta = CATEGORIES.find((c) => c.value === bracket.category);
  const rounds = getRounds(bracket.size);
  const usedCompetitorIds = new Set<string>();
  bracket.matchups.forEach((m) => {
    if (m.isSuperFinal) return;
    if (m.leftCompetitorId) usedCompetitorIds.add(m.leftCompetitorId);
    if (m.rightCompetitorId) usedCompetitorIds.add(m.rightCompetitorId);
  });
  const availableCompetitors = bracket.competitors.filter((c) => !usedCompetitorIds.has(c.id));
  const superFinal = bracket.matchups.find((m) => m.isSuperFinal);

  // Estado local do layout (slots) para drag-and-drop antes de salvar
  type Slot = { roundNumber: number; position: number; leftCompetitorId: string | null; rightCompetitorId: string | null };
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    const init: Slot[] = [];
    for (let r = 1; r <= rounds; r += 1) {
      const slotsInRound = Math.ceil(bracket.size / Math.pow(2, r));
      for (let p = 0; p < slotsInRound; p += 1) {
        const existing = bracket.matchups.find((m) => !m.isSuperFinal && m.roundNumber === r && m.position === p);
        init.push({ roundNumber: r, position: p, leftCompetitorId: existing?.leftCompetitorId ?? null, rightCompetitorId: existing?.rightCompetitorId ?? null });
      }
    }
    setSlots(init);
    setDirty(false);
  }, [bracket.id, bracket.size, bracket.matchups, rounds]);

  function placeAt(roundNumber: number, position: number, side: 'LEFT' | 'RIGHT', competitorId: string) {
    setSlots((prev) => prev.map((s) => {
      if (s.roundNumber === roundNumber && s.position === position) {
        return side === 'LEFT' ? { ...s, leftCompetitorId: competitorId } : { ...s, rightCompetitorId: competitorId };
      }
      // Remove competidor de outros slots (não pode estar em 2 lugares)
      if (s.leftCompetitorId === competitorId) return { ...s, leftCompetitorId: null };
      if (s.rightCompetitorId === competitorId) return { ...s, rightCompetitorId: null };
      return s;
    }));
    setDirty(true);
  }

  function clearSlot(roundNumber: number, position: number, side: 'LEFT' | 'RIGHT') {
    setSlots((prev) => prev.map((s) => {
      if (s.roundNumber === roundNumber && s.position === position) {
        return side === 'LEFT' ? { ...s, leftCompetitorId: null } : { ...s, rightCompetitorId: null };
      }
      return s;
    }));
    setDirty(true);
  }

  async function saveLayout() {
    try {
      await api.post(ENDPOINTS.CATEGORY_EVENTS.brackets.saveLayout(bracket.id), {
        slots: slots.map((s) => ({
          roundNumber: s.roundNumber,
          position: s.position,
          leftCompetitorId: s.leftCompetitorId,
          rightCompetitorId: s.rightCompetitorId,
        })),
      });
      push({ title: 'Chave salva', tone: 'emerald' });
      setDirty(false);
      await onChanged();
    } catch (e) { push({ title: 'Erro ao salvar chave', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  }

  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle
        title={`Categoria — ${meta?.label ?? bracket.category}`}
        sub={`${bracket.competitors.length} inscritos · ${bracket.size} pilotos · ${rounds} rodada${rounds !== 1 ? 's' : ''}`}
        action={
          <div className="flex gap-2 flex-wrap">
            <select className="input max-w-full" style={{ width: 130 }} value={bracket.size} onChange={(e) => void onChangeSize(Number(e.target.value))} disabled={busy === bracket.id}>
              {[4, 8, 16, 32, 64, 128].map((s) => <option key={s} value={s}>{s} pilotos</option>)}
            </select>
            <button className="btn btn-ghost focusable" onClick={onShowSuperFinal} title="Super Final">
              <I.Trophy size={14}/> Super Final {superFinal && '·'}
              {superFinal && <span className="chip" style={{ background: superFinal.settledAt ? 'var(--emerald-soft)' : 'var(--accent-soft)', color: superFinal.settledAt ? 'var(--emerald)' : 'var(--accent)' }}>{superFinal.settledAt ? 'liquidada' : 'configurada'}</span>}
            </button>
            <button className="btn btn-primary focusable" onClick={saveLayout} disabled={!dirty}>
              <I.Save size={14}/> {dirty ? 'Salvar chave' : 'Sem mudanças'}
            </button>
            <button className="btn-icon focusable" onClick={onRemoveBracket} title="Excluir categoria deste evento" style={{ color: '#ff7585' }}>
              <I.Trash size={15}/>
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-4">
          <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-2">
            Pilotos disponíveis ({availableCompetitors.length})
          </div>
          <div className="space-y-1.5 max-h-[480px] overflow-auto pr-1">
            {availableCompetitors.map((c) => (
              <div key={c.id}
                draggable
                onDragStart={() => setDrag(c.id)}
                onDragEnd={() => setDrag(null)}
                className="surface-2 px-3 py-2 flex items-center gap-2"
                style={{ borderRadius: 12, cursor: 'grab' }}>
                <span className="text-[10px] font-mono text-[color:var(--text-3)] w-7 shrink-0">{c.carNumber ? `#${c.carNumber}` : '—'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium truncate">{c.driver.name}</div>
                  {c.carName && <div className="text-[10.5px] text-[color:var(--text-3)] truncate">{c.carName}</div>}
                </div>
              </div>
            ))}
            {availableCompetitors.length === 0 && (
              <div className="surface-2 p-3 text-[11.5px] text-[color:var(--text-3)] text-center" style={{ borderRadius: 12 }}>
                Todos os inscritos já estão na chave.
              </div>
            )}
          </div>
        </div>

        <div className="col-span-12 md:col-span-8">
          <div className="grid gap-3 grid-cols-1 md:grid-cols-[repeat(var(--bracket-rounds),minmax(0,1fr))]" style={{ '--bracket-rounds': rounds } as React.CSSProperties}>
            {Array.from({ length: rounds }, (_, ri) => {
              const r = ri + 1;
              const roundSlots = slots.filter((s) => s.roundNumber === r).sort((a, b) => a.position - b.position);
              return (
                <div key={r}>
                  <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-2">
                    {r === rounds ? '🏆 Final' : `Rodada ${r}`}
                  </div>
                  <div className="space-y-2 md:pt-[var(--round-offset)]" style={{ '--round-offset': r === 1 ? '0px' : `${16 * r}px` } as React.CSSProperties}>
                    {roundSlots.map((slot) => {
                      const matchup = bracket.matchups.find((m) => !m.isSuperFinal && m.roundNumber === slot.roundNumber && m.position === slot.position);
                      return (
                        <SlotCard key={`${slot.roundNumber}-${slot.position}`}
                          slot={slot}
                          matchup={matchup}
                          competitors={bracket.competitors}
                          dragging={drag}
                          isFirstRound={r === 1}
                          onPlace={(side) => drag && placeAt(slot.roundNumber, slot.position, side, drag)}
                          onClear={(side) => clearSlot(slot.roundNumber, slot.position, side)}
                          onAudit={() => matchup && onAuditMatchup(matchup)}
                          onToggleMarket={() => matchup && void onToggleMarket(matchup, !matchup.marketOpen)}
                          onCancel={() => matchup && void onCancelMatchup(matchup)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ───── Slot individual com drop-target e ações ───── */

function SlotCard({
  slot, matchup, competitors, dragging: _dragging, isFirstRound, onPlace, onClear, onAudit, onToggleMarket, onCancel,
}: {
  slot: { roundNumber: number; position: number; leftCompetitorId: string | null; rightCompetitorId: string | null };
  matchup?: CategoryMatchup;
  competitors: CategoryCompetitor[];
  dragging: string | null;
  isFirstRound: boolean;
  onPlace: (side: 'LEFT' | 'RIGHT') => void;
  onClear: (side: 'LEFT' | 'RIGHT') => void;
  onAudit: () => void;
  onToggleMarket: () => void;
  onCancel: () => void;
}) {
  const left = slot.leftCompetitorId ? competitors.find((c) => c.id === slot.leftCompetitorId) : null;
  const right = slot.rightCompetitorId ? competitors.find((c) => c.id === slot.rightCompetitorId) : null;
  const settled = matchup?.winnerSide;
  const canDrop = isFirstRound && !settled && matchup?.status !== 'CANCELED';
  const canAudit = !!matchup && !settled && !!left && !!right && matchup.status !== 'CANCELED';
  const canOpenMarket = !!matchup && !settled && !!left && !!right && matchup.status !== 'CANCELED';
  const isCanceled = matchup?.status === 'CANCELED';

  return (
    <div className="surface-2 overflow-hidden" style={{ borderRadius: 12, border: '1px solid ' + (settled ? 'var(--emerald)' : isCanceled ? 'var(--rose)' : matchup?.marketOpen ? 'var(--accent)' : 'var(--border)') }}>
      {matchup?.marketOpen && !settled && (
        <div className="px-2 py-0.5 text-center text-[9px] font-bold uppercase tracking-[0.14em]"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          🟢 Apostas abertas
        </div>
      )}
      {isCanceled && (
        <div className="px-2 py-0.5 text-center text-[9px] font-bold uppercase tracking-[0.14em]"
          style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}>
          ⚠ Cancelado
        </div>
      )}
      <SlotSide side="LEFT" competitor={left} isWinner={settled === 'LEFT'} canDrop={canDrop}
        onPlace={() => onPlace('LEFT')} onClear={() => onClear('LEFT')}/>
      <div className="border-t border-[color:var(--border)]"/>
      <SlotSide side="RIGHT" competitor={right} isWinner={settled === 'RIGHT'} canDrop={canDrop}
        onPlace={() => onPlace('RIGHT')} onClear={() => onClear('RIGHT')}/>
      {(canOpenMarket || canAudit) && (
        <div className="grid grid-cols-3 gap-px" style={{ background: 'var(--border)' }}>
          {canOpenMarket && (
            <button className="text-[10px] font-bold py-1.5"
              onClick={onToggleMarket}
              style={{
                background: matchup.marketOpen ? 'var(--accent-soft)' : 'var(--emerald-soft)',
                color: matchup.marketOpen ? 'var(--accent)' : 'var(--emerald)',
              }}>
              {matchup.marketOpen ? '⏸ Fechar' : '🚀 Abrir'}
            </button>
          )}
          {canAudit && (
            <button className="text-[10px] font-bold py-1.5" onClick={onAudit}
              style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
              🏆 Auditar
            </button>
          )}
          {canOpenMarket && (
            <button className="text-[10px] font-bold py-1.5" onClick={onCancel}
              style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}>
              ❌ Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SlotSide({ side: _side, competitor, isWinner, canDrop, onPlace, onClear }: {
  side: 'LEFT' | 'RIGHT';
  competitor: CategoryCompetitor | null | undefined;
  isWinner: boolean;
  canDrop: boolean;
  onPlace: () => void;
  onClear: () => void;
}) {
  return (
    <div
      onDragOver={(e) => { if (canDrop) { e.preventDefault(); e.currentTarget.style.background = 'var(--accent-soft)'; } }}
      onDragLeave={(e) => { e.currentTarget.style.background = ''; }}
      onDrop={(e) => { e.currentTarget.style.background = ''; if (canDrop) onPlace(); }}
      className="flex items-center px-2.5 py-2 min-h-[40px]"
      style={{ background: isWinner ? 'var(--emerald-soft)' : undefined }}>
      <div className="flex-1 min-w-0">
        {competitor ? (
          <>
            <p className="text-[12px] font-semibold truncate" style={{ color: isWinner ? 'var(--emerald)' : undefined }}>
              {isWinner && '🏆 '}{competitor.driver.name}
            </p>
            {competitor.carName && <p className="text-[10px] text-[color:var(--text-4)] truncate">{competitor.carName}{competitor.carNumber ? ` #${competitor.carNumber}` : ''}</p>}
          </>
        ) : (
          <p className="text-[10.5px] italic text-[color:var(--text-4)]">{canDrop ? 'Solte aqui' : '—'}</p>
        )}
      </div>
      {competitor && canDrop && !isWinner && (
        <button onClick={onClear} className="ml-1 text-[color:var(--text-4)] hover:text-[color:var(--rose)] text-[14px] w-5 h-5 flex items-center justify-center">×</button>
      )}
    </div>
  );
}

/* ───── Modal: adicionar categoria ───── */

function AddCategoryModal({ existingCategories, onClose, onSubmit, busy }: {
  existingCategories: string[];
  onClose: () => void;
  onSubmit: (category: string, size: number) => Promise<void>;
  busy: boolean;
}) {
  const [category, setCategory] = React.useState('');
  const [size, setSize] = React.useState(8);

  const available = CATEGORIES.filter((c) => !existingCategories.includes(c.value));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-4 sm:p-6 w-full max-w-md">
        <div className="font-display text-[18px] font-bold mb-2">Adicionar categoria</div>
        <div className="text-[12px] text-[color:var(--text-3)] mb-4">Cada categoria vira uma chave independente.</div>

        <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Categoria</label>
        <select className="input mt-1 mb-3" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Selecione…</option>
          {available.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Tamanho da chave</label>
        <select className="input mt-1" value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {[4, 8, 16, 32, 64, 128].map((s) => <option key={s} value={s}>{s} pilotos</option>)}
        </select>

        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" disabled={!category || busy} onClick={() => onSubmit(category, size)}>
            {busy ? <><span className="pulse-dot"/> Adicionando…</> : <><I.Plus size={14}/> Adicionar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───── Modal: super final ───── */

function SuperFinalModal({ bracket, onClose, onChanged }: {
  bracket: CategoryBracket;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const sf = bracket.matchups.find((m) => m.isSuperFinal);
  const defaultLeft = sf?.leftCompetitorId ? bracket.competitors.find((c) => c.id === sf.leftCompetitorId) : null;
  const defaultRight = sf?.rightCompetitorId ? bracket.competitors.find((c) => c.id === sf.rightCompetitorId) : null;

  const [leftMode, setLeftMode] = React.useState<'pick' | 'free'>(defaultLeft ? 'pick' : 'free');
  const [leftDriverId, setLeftDriverId] = React.useState<string>(defaultLeft?.driver.id ?? '');
  const [leftName, setLeftName] = React.useState<string>(defaultLeft && !defaultLeft.driver.id ? defaultLeft.driver.name : '');

  const [rightMode, setRightMode] = React.useState<'pick' | 'free'>(defaultRight ? 'pick' : 'free');
  const [rightDriverId, setRightDriverId] = React.useState<string>(defaultRight?.driver.id ?? '');
  const [rightName, setRightName] = React.useState<string>(defaultRight && !defaultRight.driver.id ? defaultRight.driver.name : '');

  const [openMarket, setOpenMarket] = React.useState<boolean>(false);
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const submit = async () => {
    const left = leftMode === 'pick'
      ? { driverId: leftDriverId }
      : { driverName: leftName.trim() };
    const right = rightMode === 'pick'
      ? { driverId: rightDriverId }
      : { driverName: rightName.trim() };

    if ((leftMode === 'pick' && !leftDriverId) || (leftMode === 'free' && !leftName.trim())) {
      push({ title: 'Defina o lado 1', tone: 'rose' }); return;
    }
    if ((rightMode === 'pick' && !rightDriverId) || (rightMode === 'free' && !rightName.trim())) {
      push({ title: 'Defina o lado 2', tone: 'rose' }); return;
    }

    setBusy(true);
    try {
      await api.post(ENDPOINTS.CATEGORY_EVENTS.superFinal.upsert(bracket.id), { left, right, openMarket });
      push({ title: sf ? 'Super Final atualizada' : 'Super Final criada', tone: 'emerald' });
      onClose();
      await onChanged();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  const isSettled = !!sf?.settledAt && !!sf?.winnerSide;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-4 sm:p-6 w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <I.Trophy size={18}/>
          </div>
          <div className="flex-1">
            <div className="font-display text-[18px] font-bold">Super Final</div>
            <div className="text-[12px] text-[color:var(--text-3)]">Embate manual após as classificatórias. Cotação inicial 1.10.</div>
          </div>
        </div>

        {isSettled && (
          <div className="rounded-[10px] p-3 mb-4 text-[12px]" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
            Super Final liquidada. Vencedor: <strong>Lado {sf.winnerSide}</strong>. Não é mais possível alterar.
          </div>
        )}

        {!isSettled && (
          <>
            <SuperFinalSide title="Lado 1" mode={leftMode} setMode={setLeftMode} competitors={bracket.competitors}
              driverId={leftDriverId} setDriverId={setLeftDriverId} name={leftName} setName={setLeftName}/>

            <SuperFinalSide title="Lado 2" mode={rightMode} setMode={setRightMode} competitors={bracket.competitors}
              driverId={rightDriverId} setDriverId={setRightDriverId} name={rightName} setName={setRightName}/>

            <label className="flex items-center gap-2 mt-3 text-[12.5px]">
              <input type="checkbox" checked={openMarket} onChange={(e) => setOpenMarket(e.target.checked)}/>
              Abrir mercado de apostas imediatamente
            </label>

            <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
              <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
                {busy ? <><span className="pulse-dot"/> Salvando…</> : <><I.Check size={14}/> {sf ? 'Atualizar' : 'Criar'}</>}
              </button>
            </div>
          </>
        )}

        {isSettled && (
          <button className="btn btn-ghost w-full justify-center" onClick={onClose}>Fechar</button>
        )}
      </div>
    </div>
  );
}

function SuperFinalSide({ title, mode, setMode, competitors, driverId, setDriverId, name, setName }: {
  title: string;
  mode: 'pick' | 'free';
  setMode: (m: 'pick' | 'free') => void;
  competitors: CategoryCompetitor[];
  driverId: string;
  setDriverId: (id: string) => void;
  name: string;
  setName: (n: string) => void;
}) {
  return (
    <div className="surface-2 p-3 mb-3" style={{ borderRadius: 12 }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold tracking-[0.14em] uppercase">{title}</div>
        <div className="flex gap-1">
          <button onClick={() => setMode('pick')} className="text-[10.5px] px-2 py-0.5 rounded-[6px] font-semibold"
            style={{ background: mode === 'pick' ? 'var(--accent-soft)' : 'var(--surface-3)', color: mode === 'pick' ? 'var(--accent)' : 'var(--text-3)' }}>Inscrito</button>
          <button onClick={() => setMode('free')} className="text-[10.5px] px-2 py-0.5 rounded-[6px] font-semibold"
            style={{ background: mode === 'free' ? 'var(--accent-soft)' : 'var(--surface-3)', color: mode === 'free' ? 'var(--accent)' : 'var(--text-3)' }}>Livre</button>
        </div>
      </div>
      {mode === 'pick' ? (
        <select className="input" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
          <option value="">Selecione…</option>
          {competitors.map((c) => <option key={c.id} value={c.driver.id}>{c.driver.name}</option>)}
        </select>
      ) : (
        <input className="input" placeholder="Nome livre (cria piloto se não existir)" value={name} onChange={(e) => setName(e.target.value)}/>
      )}
    </div>
  );
}

/* ───── Modal: auditar vencedor de matchup ───── */

function AuditMatchupModal({ matchup, bracket, winnerSide, setWinnerSide, onSubmit, onClose, busy }: {
  matchup: CategoryMatchup;
  bracket: CategoryBracket;
  winnerSide: 'LEFT' | 'RIGHT';
  setWinnerSide: (s: 'LEFT' | 'RIGHT') => void;
  onSubmit: () => Promise<void> | void;
  onClose: () => void;
  busy: boolean;
}) {
  const left = matchup.leftCompetitorId ? bracket.competitors.find((c) => c.id === matchup.leftCompetitorId) : null;
  const right = matchup.rightCompetitorId ? bracket.competitors.find((c) => c.id === matchup.rightCompetitorId) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-4 sm:p-6 w-full max-w-md">
        <div className="font-display text-[18px] font-bold mb-1">Auditar vencedor</div>
        <div className="text-[12px] text-[color:var(--text-3)] mb-4">{matchup.isSuperFinal ? '🏆 Super Final' : `Rodada ${matchup.roundNumber} · Posição ${matchup.position}`}</div>

        <div className="rounded-[10px] p-3 mb-4 text-[12px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          ⚠ Ação irreversível. Apostas serão liquidadas e creditadas aos vencedores.
        </div>

        <div className="space-y-2">
          <button onClick={() => setWinnerSide('LEFT')} className="w-full surface-2 p-3 flex items-center justify-between"
            style={{ borderRadius: 12, border: '1px solid ' + (winnerSide === 'LEFT' ? 'var(--emerald)' : 'var(--border)') }}>
            <span className="font-semibold text-[13px]">{left?.driver.name ?? 'Lado 1'}</span>
            {winnerSide === 'LEFT' && <I.Check size={16} style={{ color: 'var(--emerald)' }}/>}
          </button>
          <button onClick={() => setWinnerSide('RIGHT')} className="w-full surface-2 p-3 flex items-center justify-between"
            style={{ borderRadius: 12, border: '1px solid ' + (winnerSide === 'RIGHT' ? 'var(--emerald)' : 'var(--border)') }}>
            <span className="font-semibold text-[13px]">{right?.driver.name ?? 'Lado 2'}</span>
            {winnerSide === 'RIGHT' && <I.Check size={16} style={{ color: 'var(--emerald)' }}/>}
          </button>
        </div>

        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={onSubmit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Auditando…</> : <><I.Trophy size={14}/> Confirmar</>}
          </button>
        </div>
      </div>
    </div>
  );
}
