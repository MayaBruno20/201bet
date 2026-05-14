'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Card, SectionTitle, StatusChip } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm } from '@admin/components/ui/confirm';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';

type RosterEntry = {
  id: string;
  position: number;
  isKing: boolean;
  driverId: string;
  driver: { id: string; name: string; nickname?: string | null; team?: string | null; carNumber?: string | null };
};

type Matchup = {
  id: string;
  roundNumber: number;
  roundType: 'ODD' | 'EVEN' | 'SHARK_TANK';
  order: number;
  leftPosition: number | null;
  rightPosition: number | null;
  leftDriverId: string | null;
  rightDriverId: string | null;
  leftDriver?: { id: string; name: string } | null;
  rightDriver?: { id: string; name: string } | null;
  winnerSide: 'LEFT' | 'RIGHT' | null;
  marketOpen: boolean;
  duelId: string | null;
  settledAt: string | null;
  isManualOverride: boolean;
  notes: string | null;
};

type SharkTankEntry = {
  id: string;
  driverId: string;
  driver: { id: string; name: string; isGuest?: boolean; team?: string | null; nickname?: string | null };
  status: 'REGISTERED' | 'ELIMINATED' | 'FINALIST' | 'PROMOTED';
  seed: number | null;
  notes: string | null;
};

type EventDetail = {
  id: string;
  listId: string;
  name: string;
  scheduledAt: string;
  endsAt: string | null;
  status: 'DRAFT' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELED';
  type: 'REGULAR' | 'ARMAGEDDON' | 'SHARK_TANK';
  list: { id: string; name: string; format: 'TOP_10' | 'TOP_20'; areaCode: number; roster: RosterEntry[] };
  matchups: Matchup[];
  sharkTank: SharkTankEntry[];
  notes: string | null;
};

const SHARK_STATUS_LABEL: Record<SharkTankEntry['status'], string> = {
  REGISTERED: 'Inscrito',
  ELIMINATED: 'Eliminado',
  FINALIST: 'Finalista',
  PROMOTED: 'Promovido',
};

const SHARK_STATUS_TONE: Record<SharkTankEntry['status'], { bg: string; fg: string }> = {
  REGISTERED: { bg: 'var(--surface-3)', fg: 'var(--text-2)' },
  ELIMINATED: { bg: 'var(--rose-soft)', fg: '#ff7585' },
  FINALIST: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  PROMOTED: { bg: 'var(--emerald-soft)', fg: 'var(--emerald)' },
};

const ROUND_TYPE_LABEL: Record<Matchup['roundType'], string> = {
  ODD: 'Rodada ÍMPAR',
  EVEN: 'Rodada PAR',
  SHARK_TANK: 'Shark Tank',
};

const STATUS_LABEL: Record<EventDetail['status'], string> = {
  DRAFT: 'Rascunho',
  IN_PROGRESS: 'Ao vivo',
  FINISHED: 'Encerrado',
  CANCELED: 'Cancelado',
};

export function ListEventDetail({ eventId, onClose, onChanged }: {
  eventId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [detail, setDetail] = React.useState<EventDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [settleModal, setSettleModal] = React.useState<Matchup | null>(null);
  const [manualModal, setManualModal] = React.useState<{ roundNumber: number; roundType: Matchup['roundType'] } | null>(null);
  const [tab, setTab] = React.useState<'bracket' | 'shark-tank'>('bracket');
  const [sharkAddOpen, setSharkAddOpen] = React.useState(false);
  const [allDrivers, setAllDrivers] = React.useState<Array<{ id: string; name: string; isGuest?: boolean }>>([]);
  const { push } = useToast();
  const confirm = useConfirm();

  // Auto-seleciona Shark Tank quando o evento é desse tipo
  React.useEffect(() => {
    if (detail?.type === 'SHARK_TANK') setTab('shark-tank');
  }, [detail?.type]);

  const loadDrivers = React.useCallback(async () => {
    try {
      const list = await api.get<Array<{ id: string; name: string; isGuest?: boolean }>>(ENDPOINTS.DRIVERS.list);
      setAllDrivers(list);
    } catch { /* ignore */ }
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await api.get<EventDetail>(ENDPOINTS.BRAZIL_LISTS.events.detail(eventId)));
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);
  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => { void loadDrivers(); }, [loadDrivers]);

  const updateSharkStatus = async (entry: SharkTankEntry, status: SharkTankEntry['status']) => {
    setBusy(entry.id);
    try {
      await api.patch(ENDPOINTS.BRAZIL_LISTS.sharkTank.update(entry.id), { status });
      push({ title: 'Status atualizado', body: SHARK_STATUS_LABEL[status], tone: 'emerald' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const removeSharkEntry = async (entry: SharkTankEntry) => {
    const ok = await confirm({
      title: 'Remover do Shark Tank?',
      body: <><strong>{entry.driver.name}</strong> sai da disputa.</>,
      tone: 'warning',
      confirmLabel: 'Remover',
      icon: 'Trash',
    });
    if (!ok) return;
    setBusy(entry.id);
    try {
      await api.del(ENDPOINTS.BRAZIL_LISTS.sharkTank.delete(entry.id));
      push({ title: 'Removido', tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const generate = async (roundType: Matchup['roundType']) => {
    if (roundType === 'SHARK_TANK') {
      push({ title: 'Use os endpoints de Shark Tank (em breve no painel)', tone: 'amber' });
      return;
    }
    const ok = await confirm({
      title: `Gerar ${ROUND_TYPE_LABEL[roundType]}?`,
      body: <>Vai criar os embates da próxima rodada {roundType === 'ODD' ? 'ÍMPAR' : 'PAR'} com base no roster atual. Embates já existentes nessa rodada serão substituídos.</>,
      tone: 'info',
      confirmLabel: 'Gerar embates',
      icon: 'Sparkles',
    });
    if (!ok) return;
    setBusy(`gen-${roundType}`);
    try {
      const result = await api.post<{ count: number; roundNumber: number }>(
        ENDPOINTS.BRAZIL_LISTS.events.generateMatchups(eventId),
        { roundType },
      );
      push({ title: `${result.count} embates gerados`, body: `Rodada ${result.roundNumber}`, tone: 'emerald' });
      await load();
      onChanged?.();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const toggleMarket = async (m: Matchup) => {
    setBusy(m.id);
    try {
      await api.patch(ENDPOINTS.BRAZIL_LISTS.matchups.toggleMarket(m.id), { open: !m.marketOpen });
      push({ title: m.marketOpen ? 'Mercado fechado' : 'Mercado aberto', tone: m.marketOpen ? 'amber' : 'emerald' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const openAllForRound = async (roundNumber: number, roundType: Matchup['roundType']) => {
    const ok = await confirm({
      title: 'Abrir todos os mercados desta rodada?',
      body: <>Vai abrir simultaneamente todos os embates pendentes da rodada <strong>{roundNumber}</strong> ({roundType === 'ODD' ? 'ÍMPAR' : roundType === 'EVEN' ? 'PAR' : 'Shark Tank'}). O fluxo padrão é abertura sequencial (cada mercado abre quando o anterior é auditado).</>,
      tone: 'warning',
      confirmLabel: 'Abrir todos',
      icon: 'Play',
    });
    if (!ok) return;
    setBusy(`open-all-${roundNumber}-${roundType}`);
    try {
      const result = await api.post<{ opened: number; total: number; failures?: Array<{ id: string; error: string }> }>(
        ENDPOINTS.BRAZIL_LISTS.events.openAllMarkets(eventId),
        { roundNumber, roundType },
      );
      if (result.opened === 0 && (result.failures?.length ?? 0) === 0) {
        push({ title: 'Nenhum embate pendente para abrir', tone: 'amber' });
      } else {
        push({
          title: `${result.opened} mercado(s) abertos`,
          body: result.failures?.length ? `${result.failures.length} falha(s) — verifique audit log.` : `Total processado: ${result.total}.`,
          tone: result.failures?.length ? 'amber' : 'emerald',
        });
      }
      await load();
      onChanged?.();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const removeMatchup = async (m: Matchup) => {
    const ok = await confirm({
      title: 'Excluir embate?',
      body: m.marketOpen ? 'Mercado deste embate está ABERTO. Apostas serão reembolsadas.' : 'Embate em rascunho/sem apostas — pode excluir tranquilo.',
      tone: 'danger',
      confirmLabel: 'Excluir embate',
      icon: 'Trash',
    });
    if (!ok) return;
    setBusy(m.id);
    try {
      await api.del(ENDPOINTS.BRAZIL_LISTS.matchups.delete(m.id));
      push({ title: 'Embate removido', tone: 'amber' });
      await load();
      onChanged?.();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  if (loading || !detail) {
    return (
      <div className="fixed inset-0 z-[150] cmdk-overlay flex items-center justify-center p-4" onClick={onClose}>
        <div className="surface-elev p-6 text-[13px] text-[color:var(--text-3)]">Carregando…</div>
      </div>
    );
  }

  // Agrupa matchups por roundNumber
  const matchupsByRound = new Map<number, Matchup[]>();
  for (const m of detail.matchups) {
    const list = matchupsByRound.get(m.roundNumber) ?? [];
    list.push(m);
    matchupsByRound.set(m.roundNumber, list);
  }
  const rounds = [...matchupsByRound.entries()].sort((a, b) => a[0] - b[0]);

  return (
    <div className="fixed inset-0 z-[150] cmdk-overlay overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="min-h-full flex items-start justify-center p-4 py-10">
        <div className="surface-elev w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="p-5 flex items-start gap-4 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="w-12 h-12 rounded-[14px] grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              <I.Trophy size={20}/>
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">
                {detail.list.name} · {detail.list.format} · DDD {detail.list.areaCode}
              </div>
              <div className="font-display text-[22px] font-bold leading-tight mt-0.5">{detail.name}</div>
              <div className="flex items-center gap-2 mt-2 text-[12px] text-[color:var(--text-3)] flex-wrap">
                <StatusChip status={STATUS_LABEL[detail.status]}/>
                <span>{new Date(detail.scheduledAt).toLocaleString('pt-BR')}</span>
                {detail.endsAt && <span>— {new Date(detail.endsAt).toLocaleString('pt-BR')}</span>}
                <span>· Roster: {detail.list.roster.length}/{detail.list.format === 'TOP_20' ? 20 : 10}</span>
              </div>
            </div>
            <button className="btn btn-ghost focusable" onClick={onClose}>
              <I.X size={14}/> Fechar
            </button>
          </div>

          {/* Tabs */}
          <div className="px-5 pt-4 flex items-center gap-1 surface-2 mx-5 mt-4 rounded-[12px] p-1 w-fit" style={{ background: 'var(--surface-2)' }}>
            <button
              onClick={() => setTab('bracket')}
              className="px-3 py-1.5 text-[12.5px] font-semibold rounded-[8px] flex items-center gap-1.5"
              style={{
                background: tab === 'bracket' ? 'var(--surface-3)' : 'transparent',
                color: tab === 'bracket' ? 'var(--text)' : 'var(--text-3)',
              }}
            >
              <I.Layers size={13}/> Bracket / Embates
              <span className="text-[10.5px] tabular-nums" style={{ opacity: 0.6 }}>({detail.matchups.length})</span>
            </button>
            <button
              onClick={() => setTab('shark-tank')}
              className="px-3 py-1.5 text-[12.5px] font-semibold rounded-[8px] flex items-center gap-1.5"
              style={{
                background: tab === 'shark-tank' ? 'var(--surface-3)' : 'transparent',
                color: tab === 'shark-tank' ? (detail.type === 'SHARK_TANK' ? 'var(--accent)' : 'var(--text)') : 'var(--text-3)',
              }}
            >
              <I.Flame size={13}/> Shark Tank
              <span className="text-[10.5px] tabular-nums" style={{ opacity: 0.6 }}>({detail.sharkTank?.length ?? 0})</span>
            </button>
          </div>

          {tab === 'bracket' && <>
          {/* Generate matchups */}
          <div className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <SectionTitle title="Gerar rodada"
              sub={
                <>
                  <strong>ÍMPAR:</strong> 3×2, 5×4, 7×6{detail.list.format === 'TOP_20' ? ', … 19×18' : ', 9×8'} (rei senta).{' '}
                  <strong>PAR:</strong> 2×1, 4×3, 6×5{detail.list.format === 'TOP_20' ? ', … 20×19' : ', 8×7, 10×9'} (rei é desafiado).
                  <br/>
                  Ao gerar, o <strong>primeiro embate abre automaticamente</strong>; os seguintes abrem conforme o admin audita o anterior.
                </>
              }/>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                className="btn btn-primary"
                onClick={() => generate('ODD')}
                disabled={busy === 'gen-ODD' || detail.list.roster.length < 2 || detail.status === 'CANCELED' || detail.status === 'FINISHED'}
              >
                {busy === 'gen-ODD' ? <><span className="pulse-dot"/> Gerando…</> : <><I.Sparkles size={14}/> Nova rodada ÍMPAR</>}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => generate('EVEN')}
                disabled={busy === 'gen-EVEN' || detail.list.roster.length < 2 || detail.status === 'CANCELED' || detail.status === 'FINISHED'}
              >
                {busy === 'gen-EVEN' ? <><span className="pulse-dot"/> Gerando…</> : <><I.Sparkles size={14}/> Nova rodada PAR</>}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setManualModal({ roundNumber: rounds.length + 1, roundType: 'ODD' })}
                disabled={detail.status === 'CANCELED' || detail.status === 'FINISHED'}
              >
                <I.Plus size={14}/> Embate manual
              </button>
            </div>
            {detail.list.roster.length < 2 && (
              <div className="rounded-[10px] p-3 mt-3 text-[12px]" style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}>
                ⚠ Roster com menos de 2 pilotos — preencha o roster antes de gerar embates.
              </div>
            )}
          </div>

          {/* Rounds */}
          <div className="p-5">
            {rounds.length === 0 ? (
              <Card className="p-12 text-center">
                <div className="w-14 h-14 rounded-[14px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)' }}>
                  <I.Layers size={22} style={{ color: 'var(--text-3)' }}/>
                </div>
                <div className="font-display text-[15px] font-semibold mt-3">Nenhum embate ainda</div>
                <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">Gere uma rodada ÍMPAR/PAR ou crie um embate manual acima.</div>
              </Card>
            ) : (
              <div className="space-y-5">
                {rounds.map(([roundNumber, matchups]) => {
                  const sorted = [...matchups].sort((a, b) => a.order - b.order);
                  const settled = sorted.filter((m) => m.winnerSide).length;
                  const open = sorted.filter((m) => m.marketOpen).length;
                  const pendingClosed = sorted.filter((m) => !m.winnerSide && !m.marketOpen).length;
                  const roundType = sorted[0].roundType;
                  const canOpenAll = pendingClosed > 0 && detail.status !== 'CANCELED' && detail.status !== 'FINISHED';
                  const openAllKey = `open-all-${roundNumber}-${roundType}`;
                  return (
                    <div key={roundNumber}>
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <div className="font-display text-[14px] font-bold">Rodada {roundNumber}</div>
                        <span className="chip" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                          {ROUND_TYPE_LABEL[roundType]}
                        </span>
                        <span className="text-[11.5px] text-[color:var(--text-3)]">
                          {settled}/{sorted.length} auditados · {open} mercado(s) aberto(s)
                        </span>
                        {canOpenAll && (
                          <button
                            className="btn btn-ghost focusable ml-auto"
                            onClick={() => void openAllForRound(roundNumber, roundType)}
                            disabled={busy === openAllKey}
                            title="Abre todos os mercados pendentes desta rodada de uma vez"
                          >
                            {busy === openAllKey
                              ? <><span className="pulse-dot"/> Abrindo {pendingClosed}…</>
                              : <><I.Play size={13}/> Abrir todos ({pendingClosed})</>}
                          </button>
                        )}
                      </div>
                      <div className="space-y-2">
                        {sorted.map((m) => (
                          <MatchupRow
                            key={m.id}
                            matchup={m}
                            busy={busy === m.id}
                            onToggleMarket={() => void toggleMarket(m)}
                            onSettle={() => setSettleModal(m)}
                            onDelete={() => void removeMatchup(m)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </>}

          {tab === 'shark-tank' && (
            <SharkTankPanel
              detail={detail}
              busy={busy}
              onAdd={() => setSharkAddOpen(true)}
              onUpdateStatus={(entry, status) => void updateSharkStatus(entry, status)}
              onRemove={(entry) => void removeSharkEntry(entry)}
            />
          )}
        </div>
      </div>

      {sharkAddOpen && detail && (
        <AddSharkTankEntryModal
          eventId={eventId}
          drivers={allDrivers}
          existingDriverIds={new Set(detail.sharkTank?.map((s) => s.driverId) ?? [])}
          onClose={() => setSharkAddOpen(false)}
          onSaved={() => { setSharkAddOpen(false); void load(); void loadDrivers(); }}
        />
      )}

      {settleModal && (
        <SettleMatchupModal
          matchup={settleModal}
          onClose={() => setSettleModal(null)}
          onSaved={() => { setSettleModal(null); void load(); onChanged?.(); }}
        />
      )}

      {manualModal && (
        <ManualMatchupModal
          eventId={eventId}
          roster={detail.list.roster}
          defaultRoundNumber={manualModal.roundNumber}
          defaultRoundType={manualModal.roundType}
          onClose={() => setManualModal(null)}
          onSaved={() => { setManualModal(null); void load(); onChanged?.(); }}
        />
      )}
    </div>
  );
}

const MatchupRow: React.FC<{
  matchup: Matchup;
  busy: boolean;
  onToggleMarket: () => void;
  onSettle: () => void;
  onDelete: () => void;
}> = ({ matchup: m, busy, onToggleMarket, onSettle, onDelete }) => {
  const settled = !!m.winnerSide;
  const leftWon = m.winnerSide === 'LEFT';
  const rightWon = m.winnerSide === 'RIGHT';

  return (
    <div className="surface-2 p-3" style={{ borderRadius: 12 }}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] shrink-0" style={{ width: 32 }}>
          #{m.order}
        </div>

        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* Left driver */}
          <div className="flex items-center gap-2 justify-end text-right" style={{ opacity: settled && !leftWon ? 0.5 : 1 }}>
            <div className="min-w-0">
              <div className="font-semibold text-[13px] truncate">{m.leftDriver?.name ?? 'A definir'}</div>
              {m.leftPosition && <div className="text-[10.5px] text-[color:var(--text-3)]">Pos. {m.leftPosition}º</div>}
            </div>
            {leftWon && <span className="chip shrink-0" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>VENCEU</span>}
          </div>

          {/* VS / status */}
          <div className="text-center px-2">
            <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase" style={{ color: 'var(--text-3)' }}>VS</div>
            {settled ? (
              <div className="text-[10px] text-[color:var(--text-3)] mt-0.5">
                {m.settledAt ? new Date(m.settledAt).toLocaleString('pt-BR') : ''}
              </div>
            ) : m.marketOpen ? (
              <div className="text-[10px] font-semibold mt-0.5" style={{ color: 'var(--emerald)' }}>● MERCADO ABERTO</div>
            ) : (
              <div className="text-[10px] text-[color:var(--text-4)] mt-0.5">Mercado fechado</div>
            )}
          </div>

          {/* Right driver */}
          <div className="flex items-center gap-2 text-left" style={{ opacity: settled && !rightWon ? 0.5 : 1 }}>
            {rightWon && <span className="chip shrink-0" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>VENCEU</span>}
            <div className="min-w-0">
              <div className="font-semibold text-[13px] truncate">{m.rightDriver?.name ?? 'A definir'}</div>
              {m.rightPosition && <div className="text-[10.5px] text-[color:var(--text-3)]">Pos. {m.rightPosition}º</div>}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {!settled && (
            <>
              <button
                className="btn"
                onClick={onToggleMarket}
                disabled={busy || !m.leftDriverId || !m.rightDriverId}
                style={{
                  background: m.marketOpen ? 'var(--rose-soft)' : 'var(--emerald-soft)',
                  color: m.marketOpen ? 'var(--rose)' : 'var(--emerald)',
                }}
                title={!m.leftDriverId || !m.rightDriverId ? 'Defina pilotos antes de abrir o mercado' : undefined}
              >
                {m.marketOpen ? <><I.Pause size={13}/> Fechar mercado</> : <><I.Play size={13}/> Abrir mercado</>}
              </button>
              <button
                className="btn btn-primary"
                onClick={onSettle}
                disabled={busy || !m.leftDriverId || !m.rightDriverId}
              >
                <I.Check size={13}/> Auditar
              </button>
              <button className="btn-icon" onClick={onDelete} disabled={busy} title="Excluir embate" style={{ color: '#ff7585' }}>
                <I.Trash size={14}/>
              </button>
            </>
          )}
          {settled && (
            <span className="chip" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>AUDITADO</span>
          )}
        </div>
      </div>
      {m.notes && <div className="text-[11px] text-[color:var(--text-3)] mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>{m.notes}</div>}
    </div>
  );
};

function SettleMatchupModal({ matchup, onClose, onSaved }: { matchup: Matchup; onClose: () => void; onSaved: () => void }) {
  const [winnerSide, setWinnerSide] = React.useState<'LEFT' | 'RIGHT'>('LEFT');
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(ENDPOINTS.BRAZIL_LISTS.matchups.settle(matchup.id), {
        winnerSide,
        notes: notes.trim() || undefined,
      });
      push({ title: 'Embate auditado', body: `Vencedor: ${winnerSide === 'LEFT' ? matchup.leftDriver?.name : matchup.rightDriver?.name}`, tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] cmdk-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div className="surface-elev p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
            <I.Check size={18}/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-[18px] font-bold">Auditar vencedor</div>
            <div className="text-[12px] text-[color:var(--text-3)]">Confronto fica imutável após a auditoria. Apostas em aberto serão liquidadas automaticamente.</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {(['LEFT', 'RIGHT'] as const).map((side) => {
            const driver = side === 'LEFT' ? matchup.leftDriver : matchup.rightDriver;
            const pos = side === 'LEFT' ? matchup.leftPosition : matchup.rightPosition;
            const selected = winnerSide === side;
            return (
              <button
                key={side}
                onClick={() => setWinnerSide(side)}
                className="text-center p-3"
                style={{
                  borderRadius: 12,
                  background: selected ? 'var(--emerald-soft)' : 'var(--surface-2)',
                  border: '2px solid ' + (selected ? 'var(--emerald)' : 'transparent'),
                  color: selected ? 'var(--emerald)' : 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase mb-1">
                  {side === 'LEFT' ? 'Esquerda' : 'Direita'}
                </div>
                <div className="font-semibold text-[13px] truncate">{driver?.name ?? '—'}</div>
                {pos && <div className="text-[10.5px] mt-0.5" style={{ opacity: 0.7 }}>Posição {pos}º</div>}
              </button>
            );
          })}
        </div>

        <div>
          <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Notas (opcional)</label>
          <textarea className="input mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: queimada, reação ruim, etc"/>
        </div>

        <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Auditando…</> : <><I.Check size={14}/> Confirmar vencedor</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManualMatchupModal({ eventId, roster, defaultRoundNumber, defaultRoundType, onClose, onSaved }: {
  eventId: string;
  roster: RosterEntry[];
  defaultRoundNumber: number;
  defaultRoundType: Matchup['roundType'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roundNumber, setRoundNumber] = React.useState(defaultRoundNumber);
  const [roundType, setRoundType] = React.useState<Matchup['roundType']>(defaultRoundType);
  const [order, setOrder] = React.useState(1);
  const [leftDriverId, setLeftDriverId] = React.useState('');
  const [rightDriverId, setRightDriverId] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const submit = async () => {
    if (!leftDriverId || !rightDriverId) { push({ title: 'Selecione os dois pilotos', tone: 'rose' }); return; }
    if (leftDriverId === rightDriverId) { push({ title: 'Pilotos devem ser diferentes', tone: 'rose' }); return; }
    setBusy(true);
    try {
      await api.post(ENDPOINTS.BRAZIL_LISTS.matchups.create(eventId), {
        roundNumber,
        roundType,
        order,
        leftDriverId,
        rightDriverId,
        notes: notes.trim() || undefined,
      });
      push({ title: 'Embate criado', tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] cmdk-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div className="surface-elev p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-[18px] font-bold mb-1">Embate manual</div>
        <div className="text-[12px] text-[color:var(--text-3)] mb-4">Cria um embate fora do bracket auto-gerado (ex: rodada extra, desempate).</div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Rodada</label>
              <input type="number" min={1} className="input mt-1" value={roundNumber} onChange={(e) => setRoundNumber(Math.max(1, Number(e.target.value) || 1))}/>
            </div>
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Tipo</label>
              <select className="input mt-1" value={roundType} onChange={(e) => setRoundType(e.target.value as Matchup['roundType'])}>
                <option value="ODD">ÍMPAR</option>
                <option value="EVEN">PAR</option>
              </select>
            </div>
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Ordem</label>
              <input type="number" min={1} className="input mt-1" value={order} onChange={(e) => setOrder(Math.max(1, Number(e.target.value) || 1))}/>
            </div>
          </div>

          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Piloto esquerda *</label>
            <select className="input mt-1" value={leftDriverId} onChange={(e) => setLeftDriverId(e.target.value)}>
              <option value="">Selecione…</option>
              {[...roster].sort((a, b) => a.position - b.position).map((r) => (
                <option key={r.id} value={r.driverId}>{r.position}º · {r.driver.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Piloto direita *</label>
            <select className="input mt-1" value={rightDriverId} onChange={(e) => setRightDriverId(e.target.value)}>
              <option value="">Selecione…</option>
              {[...roster].sort((a, b) => a.position - b.position).map((r) => (
                <option key={r.id} value={r.driverId}>{r.position}º · {r.driver.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Notas</label>
            <input className="input mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: rodada de desempate"/>
          </div>
        </div>

        <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Salvando…</> : <><I.Check size={14}/> Criar embate</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Shark Tank ─────────────────────────────────────── */

const SharkTankPanel: React.FC<{
  detail: EventDetail;
  busy: string | null;
  onAdd: () => void;
  onUpdateStatus: (entry: SharkTankEntry, status: SharkTankEntry['status']) => void;
  onRemove: (entry: SharkTankEntry) => void;
}> = ({ detail, busy, onAdd, onUpdateStatus, onRemove }) => {
  const entries = [...(detail.sharkTank ?? [])].sort((a, b) => {
    const sa = a.seed ?? 999;
    const sb = b.seed ?? 999;
    if (sa !== sb) return sa - sb;
    return a.driver.name.localeCompare(b.driver.name);
  });

  const byStatus = (s: SharkTankEntry['status']) => entries.filter((e) => e.status === s).length;

  return (
    <div className="p-5">
      <div className="mb-4">
        <SectionTitle
          title="Shark Tank"
          sub="Pilotos challengers que disputam vaga no roster da Lista."
          action={
            <button
              className="btn btn-primary"
              onClick={onAdd}
              disabled={detail.status === 'CANCELED' || detail.status === 'FINISHED'}
            >
              <I.Plus size={14}/> Inscrever piloto
            </button>
          }
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {([
          { key: 'REGISTERED', label: 'Inscritos' },
          { key: 'FINALIST', label: 'Finalistas' },
          { key: 'PROMOTED', label: 'Promovidos' },
          { key: 'ELIMINATED', label: 'Eliminados' },
        ] as const).map((m) => {
          const tone = SHARK_STATUS_TONE[m.key];
          return (
            <div key={m.key} className="surface-2 p-3" style={{ borderRadius: 12 }}>
              <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">{m.label}</div>
              <div className="font-display text-[22px] font-bold mt-0.5 tabular-nums" style={{ color: tone.fg }}>{byStatus(m.key)}</div>
            </div>
          );
        })}
      </div>

      {entries.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="w-14 h-14 rounded-[14px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)' }}>
            <I.Flame size={22} style={{ color: 'var(--text-3)' }}/>
          </div>
          <div className="font-display text-[15px] font-semibold mt-3">Nenhum piloto no Shark Tank</div>
          <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">Inscreva challengers que vão disputar uma vaga no roster.</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const tone = SHARK_STATUS_TONE[entry.status];
            return (
              <div key={entry.id} className="surface-2 p-3 flex items-center gap-3 flex-wrap" style={{ borderRadius: 12 }}>
                <div className="w-10 h-10 rounded-[10px] grid place-items-center font-display font-bold tabular-nums shrink-0"
                  style={{ background: tone.bg, color: tone.fg }}>
                  {entry.seed ?? '?'}
                </div>
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold text-[13.5px]">{entry.driver.name}</div>
                    {entry.driver.isGuest && (
                      <span className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 9 }}>
                        CONVIDADO
                      </span>
                    )}
                    <span className="chip" style={{ background: tone.bg, color: tone.fg }}>
                      {SHARK_STATUS_LABEL[entry.status]}
                    </span>
                  </div>
                  <div className="text-[10.5px] text-[color:var(--text-3)] mt-0.5">
                    {entry.driver.team ?? '—'}{entry.driver.nickname ? ` · "${entry.driver.nickname}"` : ''}{entry.notes ? ` · ${entry.notes}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <select
                    className="input"
                    style={{ width: 140 }}
                    value={entry.status}
                    onChange={(e) => onUpdateStatus(entry, e.target.value as SharkTankEntry['status'])}
                    disabled={busy === entry.id}
                  >
                    {(['REGISTERED', 'FINALIST', 'PROMOTED', 'ELIMINATED'] as const).map((st) => (
                      <option key={st} value={st}>{SHARK_STATUS_LABEL[st]}</option>
                    ))}
                  </select>
                  <button
                    className="btn-icon"
                    onClick={() => onRemove(entry)}
                    title="Remover"
                    style={{ color: '#ff7585' }}
                    disabled={busy === entry.id}
                  >
                    <I.Trash size={15}/>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function AddSharkTankEntryModal({ eventId, drivers, existingDriverIds, onClose, onSaved }: {
  eventId: string;
  drivers: Array<{ id: string; name: string; isGuest?: boolean }>;
  existingDriverIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = React.useState<'existing' | 'guest'>('existing');
  const [driverId, setDriverId] = React.useState('');
  const [guestName, setGuestName] = React.useState('');
  const [seed, setSeed] = React.useState<string>('');
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const submit = async () => {
    setBusy(true);
    try {
      let resolvedDriverId = driverId;
      if (mode === 'guest') {
        const trimmed = guestName.trim();
        if (!trimmed) { push({ title: 'Informe o nome do piloto convidado', tone: 'rose' }); setBusy(false); return; }
        // Cria piloto com isGuest=true
        const created = await api.post<{ id: string }>(ENDPOINTS.DRIVERS.create, {
          name: trimmed,
          isGuest: true,
        });
        resolvedDriverId = created.id;
      }
      if (!resolvedDriverId) { push({ title: 'Selecione um piloto', tone: 'rose' }); setBusy(false); return; }

      await api.post(ENDPOINTS.BRAZIL_LISTS.sharkTank.upsert(eventId), {
        driverId: resolvedDriverId,
        seed: seed ? Number(seed) : undefined,
        notes: notes.trim() || undefined,
      });
      push({ title: 'Inscrito no Shark Tank', tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  const availableDrivers = drivers.filter((d) => !existingDriverIds.has(d.id));

  return (
    <div className="fixed inset-0 z-[200] cmdk-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div className="surface-elev p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <I.Flame size={18}/>
          </div>
          <div>
            <div className="font-display text-[18px] font-bold">Inscrever no Shark Tank</div>
            <div className="text-[12px] text-[color:var(--text-3)]">Escolha um piloto cadastrado ou crie um convidado pra essa disputa.</div>
          </div>
        </div>

        <div className="flex items-center gap-1 surface-2 rounded-[12px] p-1 mb-3">
          {(['existing', 'guest'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex-1 px-3 py-1.5 text-[12.5px] font-semibold rounded-[8px]"
              style={{
                background: mode === m ? 'var(--surface-3)' : 'transparent',
                color: mode === m ? (m === 'guest' ? 'var(--accent)' : 'var(--text)') : 'var(--text-3)',
              }}
            >
              {m === 'existing' ? 'Cadastrado' : 'Convidado'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {mode === 'existing' ? (
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Piloto *</label>
              <select className="input mt-1" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                <option value="">Selecione…</option>
                {availableDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}{d.isGuest ? ' (convidado)' : ''}
                  </option>
                ))}
              </select>
              {availableDrivers.length === 0 && (
                <div className="text-[10.5px] text-[color:var(--text-3)] mt-1">
                  Todos os pilotos cadastrados já estão inscritos. Use "Convidado" para criar novo.
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nome do piloto convidado *</label>
              <input className="input mt-1" autoFocus value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Ex: Adair da Silva"/>
              <div className="text-[10.5px] text-[color:var(--text-3)] mt-1">Será cadastrado como CONVIDADO.</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Seed</label>
              <input
                type="number"
                min={1}
                className="input mt-1"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>

          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Observações</label>
            <input className="input mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: Indicado pela região, vencedor seletiva"/>
          </div>
        </div>

        <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Inscrevendo…</> : <><I.Check size={14}/> Inscrever</>}
          </button>
        </div>
      </div>
    </div>
  );
}
