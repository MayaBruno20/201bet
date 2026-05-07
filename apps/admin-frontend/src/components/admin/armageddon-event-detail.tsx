'use client';

import * as React from 'react';
import { I } from '@/components/ui/icons';
import { Card, SectionTitle } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/lib/endpoints';

type Driver = { id: string; name: string; team?: string | null };

type RosterEntry = {
  id: string;
  driver: Driver;
  sourceListAreaCode?: number | null;
  active: boolean;
};

type Matchup = {
  id: string;
  roundNumber: number;
  roundType: string;
  position: number;
  marketOpen: boolean;
  status: 'PENDING' | 'COMPLETED' | 'INVALIDATED' | 'CANCELED';
  winnerSide?: 'LEFT' | 'RIGHT' | null;
  settledAt?: string | null;
  leftCompetitor?: Driver | null;
  rightCompetitor?: Driver | null;
};

type ArmageddonDetail = {
  id: string;
  name: string;
  status: string;
  scheduledAt: string;
  endsAt: string | null;
  roster: RosterEntry[];
  matchups: Matchup[];
};

export function ArmageddonEventDetail({ eventId, onChanged }: { eventId: string; onChanged?: () => void }) {
  const [detail, setDetail] = React.useState<ArmageddonDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<'roster' | 'matchups'>('roster');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [importOpen, setImportOpen] = React.useState(false);
  const [auditMatchup, setAuditMatchup] = React.useState<Matchup | null>(null);
  const [auditWinner, setAuditWinner] = React.useState<'LEFT' | 'RIGHT'>('LEFT');
  const { push } = useToast();
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setDetail(await api.get<ArmageddonDetail>(ENDPOINTS.ARMAGEDDON.detail(eventId))); }
    catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);
  React.useEffect(() => { void load(); }, [load]);

  const removeRoster = async (r: RosterEntry) => {
    const ok = await confirm({
      title: 'Remover do roster?',
      body: <><strong>{r.driver.name}</strong> sai do Armageddon. Matchups já gerados não são desfeitos.</>,
      tone: 'warning',
      confirmLabel: 'Remover',
      icon: 'Trash',
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      await api.del(ENDPOINTS.ARMAGEDDON.roster.delete(eventId, r.id));
      push({ title: 'Removido', tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const clearRoster = async () => {
    const ok = await confirm({
      title: 'Limpar roster inteiro?',
      body: 'Vai apagar TODOS os inscritos do Armageddon. Ação destrutiva, não tem como desfazer.',
      tone: 'danger',
      confirmLabel: 'Limpar tudo',
      icon: 'Trash',
    });
    if (!ok) return;
    setBusy('clear');
    try {
      await api.del(ENDPOINTS.ARMAGEDDON.roster.clear(eventId));
      push({ title: 'Roster limpo', tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const generateMatchups = async () => {
    const ok = await confirm({
      title: 'Gerar próxima rodada?',
      body: 'Vai gerar os matchups da próxima rodada com base no roster atual.',
      tone: 'info',
      confirmLabel: 'Gerar matchups',
      icon: 'Sparkles',
    });
    if (!ok) return;
    setBusy('generate');
    try {
      await api.post(ENDPOINTS.ARMAGEDDON.matchups.generate(eventId));
      push({ title: 'Matchups gerados', tone: 'emerald' });
      setTab('matchups');
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const toggleMarket = async (m: Matchup) => {
    setBusy(m.id);
    try {
      await api.patch(ENDPOINTS.ARMAGEDDON.matchups.toggleMarket(m.id), { open: !m.marketOpen });
      push({ title: m.marketOpen ? 'Apostas fechadas' : 'Apostas abertas', tone: m.marketOpen ? 'amber' : 'emerald' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const submitAudit = async () => {
    if (!auditMatchup) return;
    setBusy(auditMatchup.id);
    try {
      await api.post(ENDPOINTS.ARMAGEDDON.matchups.settle(auditMatchup.id), { winnerSide: auditWinner });
      push({ title: 'Auditado', tone: 'emerald' });
      setAuditMatchup(null);
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  if (loading) return <Card className="p-12 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</Card>;
  if (!detail) return null;

  // Agrupa matchups por rodada
  const matchupsByRound = new Map<number, Matchup[]>();
  detail.matchups.forEach((m) => {
    const arr = matchupsByRound.get(m.roundNumber) ?? [];
    arr.push(m);
    matchupsByRound.set(m.roundNumber, arr);
  });
  const rounds = Array.from(matchupsByRound.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setTab('roster')} className={`tab ${tab === 'roster' ? 'active' : ''}`}>
            Inscritos <span className="text-[color:var(--text-4)]">({detail.roster.length})</span>
          </button>
          <button onClick={() => setTab('matchups')} className={`tab ${tab === 'matchups' ? 'active' : ''}`}>
            Embates <span className="text-[color:var(--text-4)]">({detail.matchups.length})</span>
          </button>
        </div>
      </Card>

      {tab === 'roster' && (
        <Card className="p-5">
          <SectionTitle title="Inscritos no Armageddon" sub="Pilotos importados das Listas Brasil ou adicionados manualmente."
            action={<>
              <button className="btn btn-ghost focusable" onClick={() => setImportOpen(true)}>
                <I.Upload size={14}/> Importar das Listas
              </button>
              <button className="btn btn-primary focusable" onClick={generateMatchups} disabled={busy === 'generate' || detail.roster.length < 2}>
                {busy === 'generate' ? <><span className="pulse-dot"/> Gerando…</> : <><I.Bolt size={14}/> Gerar próxima rodada</>}
              </button>
              {detail.roster.length > 0 && (
                <button className="btn-icon focusable" onClick={clearRoster} title="Limpar roster" style={{ color: '#ff7585' }} disabled={busy === 'clear'}>
                  <I.Trash size={15}/>
                </button>
              )}
            </>}/>

          {detail.roster.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 rounded-[12px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)' }}>
                <I.Flame size={20} style={{ color: 'var(--text-3)' }}/>
              </div>
              <div className="font-display text-[15px] font-semibold mt-3">Nenhum inscrito</div>
              <div className="text-[12.5px] text-[color:var(--text-3)] mt-1 max-w-md mx-auto">
                Importe pilotos das Listas Brasil pra começar.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {detail.roster.map((r) => (
                <div key={r.id} className="surface-2 p-3 flex items-center gap-3" style={{ borderRadius: 12 }}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[13px] truncate">{r.driver.name}</div>
                    <div className="text-[11px] text-[color:var(--text-3)] truncate">
                      {r.driver.team ?? '—'}{r.sourceListAreaCode ? ` · DDD ${String(r.sourceListAreaCode).padStart(2, '0')}` : ''}
                    </div>
                  </div>
                  <button className="btn-icon" onClick={() => void removeRoster(r)} title="Remover" style={{ color: '#ff7585' }} disabled={busy === r.id}>
                    <I.X size={15}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'matchups' && (
        <Card className="p-5">
          <SectionTitle title="Embates por rodada" sub="Abra/feche mercado e audite vencedores." action={
            <button className="btn btn-primary" onClick={generateMatchups} disabled={busy === 'generate'}>
              <I.Plus size={14}/> Gerar próxima rodada
            </button>
          }/>

          {detail.matchups.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-[color:var(--text-3)]">Nenhum embate ainda. Gere a primeira rodada na aba Inscritos.</div>
          ) : (
            <div className="space-y-5">
              {rounds.map((rn) => (
                <div key={rn}>
                  <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-2">
                    Rodada {rn}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(matchupsByRound.get(rn) ?? []).map((m) => {
                      const isCanceled = m.status === 'CANCELED';
                      const settled = !!m.winnerSide;
                      return (
                        <div key={m.id} className="surface-2 overflow-hidden" style={{ borderRadius: 12, border: '1px solid ' + (settled ? 'var(--emerald)' : isCanceled ? 'var(--rose)' : m.marketOpen ? 'var(--accent)' : 'var(--border)') }}>
                          {m.marketOpen && !settled && (
                            <div className="px-2 py-0.5 text-center text-[9px] font-bold uppercase tracking-[0.14em]"
                              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>🟢 Apostas abertas</div>
                          )}
                          <div className="flex items-center px-3 py-2 min-h-[40px]" style={{ background: m.winnerSide === 'LEFT' ? 'var(--emerald-soft)' : undefined }}>
                            <span className="text-[12.5px] font-semibold flex-1" style={{ color: m.winnerSide === 'LEFT' ? 'var(--emerald)' : undefined }}>
                              {m.winnerSide === 'LEFT' && '🏆 '}{m.leftCompetitor?.name ?? '—'}
                            </span>
                          </div>
                          <div className="border-t border-[color:var(--border)]"/>
                          <div className="flex items-center px-3 py-2 min-h-[40px]" style={{ background: m.winnerSide === 'RIGHT' ? 'var(--emerald-soft)' : undefined }}>
                            <span className="text-[12.5px] font-semibold flex-1" style={{ color: m.winnerSide === 'RIGHT' ? 'var(--emerald)' : undefined }}>
                              {m.winnerSide === 'RIGHT' && '🏆 '}{m.rightCompetitor?.name ?? '—'}
                            </span>
                          </div>
                          {!settled && !isCanceled && m.leftCompetitor && m.rightCompetitor && (
                            <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--border)' }}>
                              <button className="text-[10px] font-bold py-1.5"
                                onClick={() => void toggleMarket(m)} disabled={busy === m.id}
                                style={{ background: m.marketOpen ? 'var(--accent-soft)' : 'var(--emerald-soft)', color: m.marketOpen ? 'var(--accent)' : 'var(--emerald)' }}>
                                {m.marketOpen ? '⏸ Fechar' : '🚀 Abrir'}
                              </button>
                              <button className="text-[10px] font-bold py-1.5"
                                onClick={() => { setAuditMatchup(m); setAuditWinner('LEFT'); }}
                                style={{ background: 'var(--surface-3)', color: 'var(--text)' }}>
                                🏆 Auditar
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {importOpen && (
        <ImportFromListsModal
          eventId={eventId}
          onClose={() => setImportOpen(false)}
          onSaved={() => { setImportOpen(false); void load(); onChanged?.(); }}
        />
      )}

      {auditMatchup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
          <div className="surface-elev p-6 w-full max-w-md">
            <div className="font-display text-[18px] font-bold mb-1">Auditar vencedor</div>
            <div className="text-[12px] text-[color:var(--text-3)] mb-4">Rodada {auditMatchup.roundNumber} · Posição {auditMatchup.position}</div>
            <div className="rounded-[10px] p-3 mb-4 text-[12px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              ⚠ Ação irreversível. Apostas serão liquidadas.
            </div>
            <div className="space-y-2">
              {(['LEFT', 'RIGHT'] as const).map((side) => {
                const competitor = side === 'LEFT' ? auditMatchup.leftCompetitor : auditMatchup.rightCompetitor;
                return (
                  <button key={side} onClick={() => setAuditWinner(side)}
                    className="w-full surface-2 p-3 flex items-center justify-between"
                    style={{ borderRadius: 12, border: '1px solid ' + (auditWinner === side ? 'var(--emerald)' : 'var(--border)') }}>
                    <span className="font-semibold text-[13px]">{competitor?.name ?? side}</span>
                    {auditWinner === side && <I.Check size={16} style={{ color: 'var(--emerald)' }}/>}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn btn-ghost flex-1 justify-center" onClick={() => setAuditMatchup(null)} disabled={!!busy}>Cancelar</button>
              <button className="btn btn-primary flex-1 justify-center" onClick={submitAudit} disabled={!!busy}>
                {busy ? <><span className="pulse-dot"/> Auditando…</> : <><I.Trophy size={14}/> Confirmar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportFromListsModal({ eventId, onClose, onSaved }: {
  eventId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [areaCodes, setAreaCodes] = React.useState('');
  const [includeSharkTank, setIncludeSharkTank] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const submit = async () => {
    const codes = areaCodes.split(',').map((s) => s.trim()).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
    setBusy(true);
    try {
      await api.post(ENDPOINTS.ARMAGEDDON.roster.importFromLists(eventId), {
        areaCodes: codes.length > 0 ? codes : undefined,
        includeSharkTank,
      });
      push({ title: 'Importação concluída', tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-6 w-full max-w-md">
        <div className="font-display text-[18px] font-bold mb-1">Importar das Listas Brasil</div>
        <div className="text-[12px] text-[color:var(--text-3)] mb-4">
          Pilotos do TOP 10/20 das listas serão inscritos no Armageddon.
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">DDDs (vírgula, deixe vazio pra todos)</label>
            <input className="input mt-1" value={areaCodes} onChange={(e) => setAreaCodes(e.target.value)} placeholder="11, 21, 47…"/>
          </div>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={includeSharkTank} onChange={(e) => setIncludeSharkTank(e.target.checked)}/>
            Incluir candidatos do Shark Tank também
          </label>
        </div>

        <div className="flex gap-2 mt-5">
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Importando…</> : <><I.Upload size={14}/> Importar</>}
          </button>
        </div>
      </div>
    </div>
  );
}
