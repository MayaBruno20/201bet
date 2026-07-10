'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Card, SectionTitle, StatusChip } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm } from '@admin/components/ui/confirm';
import { DatePicker } from '@admin/components/ui/datepicker';
import { ListEventDetail } from '@admin/components/admin/list-event-detail';
import { FinishedEventDetail } from '@admin/components/admin/finished-event-detail';
import { api, apiUpload } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';

/**
 * IMPORTANT: o backend `serializeList` devolve roster e events numa forma flat
 * (driverName, driverTeam, driverCarNumber...) — não nested. Tipos abaixo refletem
 * EXATAMENTE o que vem da API (apps/backend/src/brazil-lists/brazil-lists.service.ts).
 */
type RosterEntry = {
  id: string;
  position: number;
  isKing: boolean;
  driverId: string;
  driverName?: string | null;
  driverNickname?: string | null;
  driverCarNumber?: string | null;
  driverTeam?: string | null;
  driverHometown?: string | null;
  driverAvatarUrl?: string | null;
};

type ListMatchup = {
  id: string;
  roundNumber: number;
  roundType: string;
  order: number;
  leftPosition?: number | null;
  rightPosition?: number | null;
  leftDriverId?: string | null;
  rightDriverId?: string | null;
  leftDriverName?: string | null;
  rightDriverName?: string | null;
  winnerSide?: 'LEFT' | 'RIGHT' | null;
  marketOpen: boolean;
  settledAt?: string | null;
  notes?: string | null;
};

type ListEvent = {
  id: string;
  eventId?: string | null;
  name: string;
  scheduledAt: string;
  endsAt?: string | null;
  status: 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELED';
  type: 'REGULAR' | 'ARMAGEDDON' | 'SHARK_TANK';
  notes?: string | null;
  matchups: ListMatchup[];
};

type ListDetail = {
  id: string;
  areaCode: number;
  name: string;
  format: 'TOP_10' | 'TOP_20';
  active: boolean;
  hometown?: string | null;
  administratorName?: string | null;
  roster?: RosterEntry[] | null;
  events?: ListEvent[] | null;
};

const EVENT_STATUS_LABEL: Record<ListEvent['status'], string> = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendado',
  IN_PROGRESS: 'Ao vivo',
  FINISHED: 'Encerrado',
  CANCELED: 'Cancelado',
};

const EVENT_TYPE_LABEL: Record<ListEvent['type'], string> = {
  REGULAR: 'Regular',
  ARMAGEDDON: 'Armageddon',
  SHARK_TANK: 'Shark Tank',
};

export function BrazilListDetail({ listId, onChanged }: { listId: string; onChanged?: () => void }) {
  const [detail, setDetail] = React.useState<ListDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<'roster' | 'events' | 'finished'>('roster');
  const [rosterModal, setRosterModal] = React.useState<RosterEntry | { newPosition: number } | null>(null);
  const [importModalOpen, setImportModalOpen] = React.useState(false);
  const [eventModal, setEventModal] = React.useState<ListEvent | { creating: true } | null>(null);
  const [eventDetailId, setEventDetailId] = React.useState<string | null>(null);
  const [finishedDetailId, setFinishedDetailId] = React.useState<string | null>(null);
  const { push } = useToast();
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await api.get<ListDetail>(ENDPOINTS.BRAZIL_LISTS.detail(listId)));
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId]);
  React.useEffect(() => { void load(); }, [load]);

  const removeRoster = async (r: RosterEntry) => {
    const ok = await confirm({
      title: 'Remover da posição?',
      body: <>Vai liberar a posição <strong>#{r.position}</strong> ocupada por <strong>{r.driverName ?? 'piloto desconhecido'}</strong>.</>,
      tone: 'warning',
      confirmLabel: 'Remover',
      icon: 'Trash',
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      await api.del(ENDPOINTS.BRAZIL_LISTS.rosters.delete(listId, r.id));
      push({ title: 'Removido do roster', tone: 'amber' });
      await load();
      onChanged?.();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const cancelEvent = async (ev: ListEvent) => {
    const ok = await confirm({
      title: 'Cancelar evento?',
      body: <><strong>{ev.name}</strong> sai do site público. Apostas em mercados abertos serão reembolsadas.</>,
      tone: 'danger',
      confirmLabel: 'Cancelar',
      icon: 'AlertTriangle',
    });
    if (!ok) return;
    setBusy(ev.id);
    try {
      await api.del(ENDPOINTS.BRAZIL_LISTS.events.delete(ev.id));
      push({ title: 'Evento cancelado', tone: 'amber' });
      await load();
      onChanged?.();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  if (loading) return <Card className="p-12 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</Card>;
  if (!detail) return null;

  const roster = detail.roster ?? [];
  const allEvents = detail.events ?? [];
  // "Eventos" mostra apenas ativos (DRAFT/SCHEDULED/IN_PROGRESS). Finalizados/cancelados
  // ficam na sub-aba dedicada — o usuário pediu separação explícita pra não confundir
  // status atual com histórico.
  const events = allEvents.filter((e) => e.status !== 'FINISHED' && e.status !== 'CANCELED');
  const finishedEvents = allEvents.filter((e) => e.status === 'FINISHED');
  const maxRoster = detail.format === 'TOP_10' ? 10 : 20;
  const positionsUsed = new Set(roster.map((r) => r.position));
  const nextOpenPosition = (() => {
    for (let i = 1; i <= maxRoster; i += 1) if (!positionsUsed.has(i)) return i;
    return maxRoster;
  })();

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <Card className="p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setTab('roster')} className={`tab ${tab === 'roster' ? 'active' : ''}`}>
            Roster <span className="text-[color:var(--text-4)]">({roster.length}/{maxRoster})</span>
          </button>
          <button onClick={() => setTab('events')} className={`tab ${tab === 'events' ? 'active' : ''}`}>
            Eventos <span className="text-[color:var(--text-4)]">({events.length})</span>
          </button>
          <button onClick={() => setTab('finished')} className={`tab ${tab === 'finished' ? 'active' : ''}`}>
            Eventos Finalizados <span className="text-[color:var(--text-4)]">({finishedEvents.length})</span>
          </button>
        </div>
      </Card>

      {tab === 'roster' && (
        <Card className="p-4 sm:p-5">
          <SectionTitle title={`Roster ${detail.format}`} sub="Pilotos titulares da lista, ordenados por posição."
            action={<>
              <button className="btn btn-ghost sm-up" onClick={() => setImportModalOpen(true)}>
                <I.Upload size={14}/> Importar PDF/DOCX
              </button>
              <button className="btn-icon sm-down" onClick={() => setImportModalOpen(true)} title="Importar PDF/DOCX">
                <I.Upload size={15}/>
              </button>
              <button className="btn btn-primary sm-up" onClick={() => setRosterModal({ newPosition: nextOpenPosition })} disabled={roster.length >= maxRoster}>
                <I.Plus size={14}/> Adicionar piloto
              </button>
              <button className="btn-icon sm-down" onClick={() => setRosterModal({ newPosition: nextOpenPosition })} disabled={roster.length >= maxRoster} title="Adicionar piloto">
                <I.Plus size={15}/>
              </button>
            </>}/>

          {roster.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-[color:var(--text-3)]">Nenhum piloto no roster ainda.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 8, width: 60 }}>#</th>
                    <th>Piloto</th>
                    <th>Equipe</th>
                    <th>Nº</th>
                    <th>Rei</th>
                    <th style={{ paddingRight: 8 }}/>
                  </tr>
                </thead>
                <tbody>
                  {[...roster].sort((a, b) => a.position - b.position).map((r) => (
                    <tr key={r.id}>
                      <td style={{ paddingLeft: 8 }}>
                        <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: r.isKing ? 'var(--accent)' : 'var(--text-2)' }}>
                          {r.isKing && '👑 '}{r.position}º
                        </span>
                      </td>
                      <td>
                        <div className="font-semibold text-[13px]">{r.driverName ?? '—'}</div>
                        {r.driverNickname && <div className="text-[10.5px] text-[color:var(--text-3)]">"{r.driverNickname}"</div>}
                      </td>
                      <td className="text-[12px] text-[color:var(--text-2)]">{r.driverTeam ?? '—'}</td>
                      <td className="text-[12px] font-mono text-[color:var(--text-2)]">{r.driverCarNumber ?? '—'}</td>
                      <td>{r.isKing ? <span className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>REI</span> : <span className="text-[color:var(--text-3)]">—</span>}</td>
                      <td className="text-right" style={{ paddingRight: 8 }}>
                        <div className="flex justify-end gap-1">
                          <button className="btn-icon" onClick={() => setRosterModal(r)} title="Editar"><I.Edit size={15}/></button>
                          <button className="btn-icon" onClick={() => void removeRoster(r)} title="Remover" style={{ color: '#ff7585' }} disabled={busy === r.id}><I.Trash size={15}/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'events' && (
        <Card className="p-4 sm:p-5">
          <SectionTitle title="Eventos da lista" sub="Eventos aparecem no /listas público após criados."
            action={
              <button className="btn btn-primary" onClick={() => setEventModal({ creating: true })} disabled={roster.length < 2}>
                <I.Plus size={14}/> Novo evento
              </button>
            }/>

          {roster.length < 2 && (
            <div className="rounded-[10px] p-3 mb-4 text-[12px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              ⚠ Adicione ao menos 2 pilotos no Roster antes de criar um evento.
            </div>
          )}

          {events.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-[color:var(--text-3)]">Nenhum evento criado ainda.</div>
          ) : (
            <div className="space-y-2">
              {events.map((ev) => (
                <div key={ev.id} className="surface-2 p-3 flex items-center gap-3 flex-wrap" style={{ borderRadius: 12 }}>
                  <div className="w-10 h-10 rounded-[10px] grid place-items-center shrink-0"
                    style={{
                      background: ev.type === 'ARMAGEDDON' ? 'var(--rose-soft)' : ev.type === 'SHARK_TANK' ? 'var(--accent-soft)' : 'var(--surface-3)',
                      color: ev.type === 'ARMAGEDDON' ? 'var(--rose)' : ev.type === 'SHARK_TANK' ? 'var(--accent)' : 'var(--text-2)',
                    }}>
                    <I.Trophy size={16}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-[13.5px]">{ev.name}</div>
                      <StatusChip status={EVENT_STATUS_LABEL[ev.status]}/>
                      <span className="chip" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
                        {EVENT_TYPE_LABEL[ev.type]}
                      </span>
                      {ev.matchups.length > 0 && (
                        <span className="text-[11px] text-[color:var(--text-3)]">{ev.matchups.length} embates</span>
                      )}
                    </div>
                    <div className="text-[11px] text-[color:var(--text-3)] mt-0.5">
                      {new Date(ev.scheduledAt).toLocaleString('pt-BR')}
                      {ev.endsAt && ` — ${new Date(ev.endsAt).toLocaleString('pt-BR')}`}
                    </div>
                    {ev.notes && <div className="text-[11px] text-[color:var(--text-2)] mt-1">{ev.notes}</div>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="btn btn-primary"
                      onClick={() => setEventDetailId(ev.id)}
                      disabled={ev.status === 'CANCELED'}
                      title="Abrir embates / chave"
                    >
                      <I.Layers size={13}/> Embates
                    </button>
                    <button className="btn-icon" onClick={() => setEventModal(ev)} title="Editar evento"><I.Edit size={15}/></button>
                    {ev.status !== 'CANCELED' && (
                      <button className="btn-icon" onClick={() => void cancelEvent(ev)} title="Cancelar evento" style={{ color: '#ff7585' }} disabled={busy === ev.id}>
                        <I.Trash size={15}/>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'finished' && (
        <Card className="p-4 sm:p-5">
          <SectionTitle
            title="Eventos finalizados"
            sub="Eventos encerrados desta lista. Clique em 'Resumo' para ver as passadas, ganhadores e a distribuição do pot."
          />

          {finishedEvents.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-[color:var(--text-3)]">
              Nenhum evento finalizado ainda. Eventos com data de fim já passada são movidos para cá automaticamente.
            </div>
          ) : (
            <div className="space-y-2">
              {finishedEvents.map((ev) => (
                <div key={ev.id} className="surface-2 p-3 flex items-center gap-3 flex-wrap" style={{ borderRadius: 12 }}>
                  <div
                    className="w-10 h-10 rounded-[10px] grid place-items-center shrink-0"
                    style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}
                  >
                    <I.Trophy size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-[13.5px]">{ev.name}</div>
                      <StatusChip status="Encerrado" />
                      <span className="chip" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>
                        {EVENT_TYPE_LABEL[ev.type]}
                      </span>
                      {ev.matchups.length > 0 && (
                        <span className="text-[11px] text-[color:var(--text-3)]">
                          {ev.matchups.length} passadas · {ev.matchups.filter((m) => m.winnerSide).length} auditadas
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[color:var(--text-3)] mt-0.5">
                      {new Date(ev.scheduledAt).toLocaleString('pt-BR')}
                      {ev.endsAt && ` — ${new Date(ev.endsAt).toLocaleString('pt-BR')}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      className="btn btn-primary"
                      onClick={() => setFinishedDetailId(ev.id)}
                      title="Ver passadas e distribuição do pot"
                    >
                      <I.Eye size={13} /> Resumo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {rosterModal && (
        <RosterModal
          listId={listId}
          maxPosition={maxRoster}
          existingPositions={positionsUsed}
          entry={rosterModal && 'id' in rosterModal ? rosterModal : null}
          defaultPosition={rosterModal && 'newPosition' in rosterModal ? rosterModal.newPosition : undefined}
          onClose={() => setRosterModal(null)}
          onSaved={() => { setRosterModal(null); void load(); onChanged?.(); }}
        />
      )}

      {importModalOpen && (
        <ImportRosterModal
          listId={listId}
          maxPosition={maxRoster}
          onClose={() => setImportModalOpen(false)}
          onApplied={() => { setImportModalOpen(false); void load(); onChanged?.(); }}
        />
      )}

      {eventModal && (
        <EventModal
          listId={listId}
          event={eventModal && 'id' in eventModal ? eventModal : null}
          onClose={() => setEventModal(null)}
          onSaved={() => { setEventModal(null); void load(); onChanged?.(); }}
        />
      )}

      {eventDetailId && (
        <ListEventDetail
          eventId={eventDetailId}
          onClose={() => setEventDetailId(null)}
          onChanged={() => { void load(); onChanged?.(); }}
        />
      )}

      {finishedDetailId && (
        <FinishedEventDetail
          eventId={finishedDetailId}
          onClose={() => setFinishedDetailId(null)}
        />
      )}
    </div>
  );
}

/* ── Modais ── */

function RosterModal({ listId, maxPosition, existingPositions, entry, defaultPosition, onClose, onSaved }: {
  listId: string;
  maxPosition: number;
  existingPositions: Set<number>;
  entry: RosterEntry | null;
  defaultPosition?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [position, setPosition] = React.useState<number>(entry?.position ?? defaultPosition ?? 1);
  const [name, setName] = React.useState(entry?.driverName ?? '');
  const [nickname, setNickname] = React.useState(entry?.driverNickname ?? '');
  const [team, setTeam] = React.useState(entry?.driverTeam ?? '');
  const [carNumber, setCarNumber] = React.useState(entry?.driverCarNumber ?? '');
  const [isKing, setIsKing] = React.useState(entry?.isKing ?? false);
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const submit = async () => {
    if (!name.trim() && !entry) { push({ title: 'Informe o nome do piloto', tone: 'rose' }); return; }
    setBusy(true);
    try {
      await api.post(ENDPOINTS.BRAZIL_LISTS.rosters.upsert(listId), {
        position,
        driverId: entry?.driverId,
        driverName: !entry ? name.trim() : undefined,
        driverNickname: nickname.trim() || undefined,
        driverTeam: team.trim() || undefined,
        driverCarNumber: carNumber.trim() || undefined,
        isKing,
      });
      push({ title: entry ? 'Atualizado' : 'Adicionado ao roster', tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-4 sm:p-6 w-full max-w-md max-h-[90dvh] overflow-y-auto">
        <div className="font-display text-[18px] font-bold mb-1">{entry ? 'Editar piloto do roster' : 'Adicionar ao roster'}</div>
        <div className="text-[12px] text-[color:var(--text-3)] mb-4">
          {entry ? 'Mudanças em ranking ficam auditadas.' : 'Se o piloto ainda não existir, é criado automaticamente.'}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Posição (1-{maxPosition})</label>
            <input type="number" min={1} max={maxPosition} className="input mt-1" value={position} onChange={(e) => setPosition(Number(e.target.value) || 1)}/>
            {!entry && existingPositions.has(position) && <p className="text-[10.5px] text-[color:var(--rose)] mt-1">⚠ Posição ocupada — vai sobrescrever o piloto atual.</p>}
          </div>
          {!entry && (
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nome do piloto *</label>
              <input className="input mt-1" autoFocus value={name} onChange={(e) => setName(e.target.value)}/>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Apelido</label>
              <input className="input mt-1" value={nickname ?? ''} onChange={(e) => setNickname(e.target.value)}/>
            </div>
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nº carro</label>
              <input className="input mt-1" value={carNumber ?? ''} onChange={(e) => setCarNumber(e.target.value)}/>
            </div>
          </div>
          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Equipe</label>
            <input className="input mt-1" value={team ?? ''} onChange={(e) => setTeam(e.target.value)}/>
          </div>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={isKing} onChange={(e) => setIsKing(e.target.checked)}/>
            👑 Marcar como Rei da região
          </label>
        </div>

        <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Salvando…</> : <><I.Check size={14}/> {entry ? 'Atualizar' : 'Adicionar'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function EventModal({ listId, event, onClose, onSaved }: {
  listId: string;
  event: ListEvent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(event?.name ?? '');
  const [scheduledAt, setScheduledAt] = React.useState(event?.scheduledAt ?? '');
  const [endsAt, setEndsAt] = React.useState(event?.endsAt ?? '');
  const [type, setType] = React.useState<ListEvent['type']>(event?.type ?? 'REGULAR');
  const [status, setStatus] = React.useState<ListEvent['status']>(event?.status ?? 'DRAFT');
  const [notes, setNotes] = React.useState(event?.notes ?? '');
  const [featured, setFeatured] = React.useState(false);
  const [bannerUrl, setBannerUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const isEdit = !!event;

  const submit = async () => {
    if (!name.trim()) { push({ title: 'Informe o nome do evento', tone: 'rose' }); return; }
    if (!scheduledAt) { push({ title: 'Defina data/hora de início', tone: 'rose' }); return; }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        scheduledAt,
        endsAt: endsAt || undefined,
        notes: notes.trim() || undefined,
      };
      if (!isEdit) {
        // O `type` só faz sentido na criação — depois disso, matchups e
        // configuração específica (Shark Tank) já estão vinculados.
        payload.type = type;
        payload.featured = featured;
        if (bannerUrl.trim()) payload.bannerUrl = bannerUrl.trim();
        await api.post(ENDPOINTS.BRAZIL_LISTS.events.create(listId), payload);
        push({ title: 'Evento criado', body: name, tone: 'emerald' });
      } else {
        payload.status = status;
        await api.patch(ENDPOINTS.BRAZIL_LISTS.events.update(event.id), payload);
        push({ title: 'Evento atualizado', tone: 'emerald' });
      }
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-4 sm:p-6 w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <I.Trophy size={18}/>
          </div>
          <div>
            <div className="font-display text-[18px] font-bold">{isEdit ? 'Editar evento' : 'Novo evento'}</div>
            <div className="text-[12px] text-[color:var(--text-3)]">
              {isEdit
                ? 'Apostas em mercados abertos de embates já settled não voltam.'
                : 'Será criado em rascunho. Vai pro /listas público assim que mudar para "Ao vivo".'}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nome do evento *</label>
            <input className="input mt-1" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: 1ª Etapa Lista 21"/>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Início *</label>
              <div className="mt-1">
                <DatePicker value={scheduledAt} onChange={setScheduledAt} placeholder="Data e hora de início"/>
              </div>
            </div>
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Fim (opcional)</label>
              <div className="mt-1">
                <DatePicker value={endsAt} onChange={setEndsAt} placeholder="Data e hora de término"/>
              </div>
            </div>
          </div>
          <div className={isEdit ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}>
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">
                Tipo {isEdit && <span className='text-[10px] normal-case font-normal text-[color:var(--text-3)]'>(não editável)</span>}
              </label>
              <select
                className='input mt-1'
                value={type}
                disabled={isEdit}
                onChange={(e) => setType(e.target.value as ListEvent['type'])}
              >
                <option value='REGULAR'>Regular</option>
                <option value='ARMAGEDDON'>Armageddon</option>
                <option value='SHARK_TANK'>Shark Tank</option>
              </select>
            </div>
            {isEdit && (
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Status</label>
                <select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value as ListEvent['status'])}>
                  <option value="DRAFT">Rascunho</option>
                  <option value="SCHEDULED">Agendado</option>
                  <option value="IN_PROGRESS">Ao vivo</option>
                  <option value="FINISHED">Encerrado</option>
                  <option value="CANCELED">Cancelado</option>
                </select>
              </div>
            )}
          </div>
          {!isEdit && (
            <>
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">URL do banner (opcional)</label>
                <input className="input mt-1" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://…"/>
              </div>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)}/>
                Destacar no /listas público (featured)
              </label>
            </>
          )}
          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Notas internas</label>
            <textarea className="input mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}/>
          </div>
        </div>

        <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Salvando…</> : <><I.Check size={14}/> {isEdit ? 'Atualizar' : 'Criar evento'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Importar roster a partir de PDF/DOCX ─────────────────────────────

type ParsedEntry = {
  position: number;
  driverName: string;
  nickname: string | null;
  carName: string | null;
  carNumber: string | null;
};

function ImportRosterModal({
  listId,
  maxPosition,
  onClose,
  onApplied,
}: {
  listId: string;
  maxPosition: number;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [entries, setEntries] = React.useState<ParsedEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { push } = useToast();

  const upload = async (f: File) => {
    setParsing(true);
    setError(null);
    setEntries(null);
    try {
      const data = await apiUpload<{ entries: ParsedEntry[] }>(
        ENDPOINTS.BRAZIL_LISTS.rosters.parseFile(listId),
        f,
        'file',
      );
      const parsed = data.entries ?? [];
      if (parsed.length === 0) {
        setError('Nenhum piloto reconhecido. Confira o formato do arquivo.');
        return;
      }
      setEntries(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao processar o arquivo.');
    } finally {
      setParsing(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    void upload(f);
  };

  const updateEntry = (idx: number, patch: Partial<ParsedEntry>) => {
    setEntries((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const removeEntry = (idx: number) => {
    setEntries((prev) => prev?.filter((_, i) => i !== idx) ?? null);
  };

  const apply = async () => {
    if (!entries || entries.length === 0) return;
    // Valida no client antes de mandar (resposta de erro do server é vaga)
    const positions = new Set<number>();
    for (const e of entries) {
      if (!e.driverName.trim()) { push({ title: 'Nome vazio', body: `Piloto na posição ${e.position} sem nome.`, tone: 'rose' }); return; }
      if (positions.has(e.position)) { push({ title: 'Posição duplicada', body: `Posição ${e.position} aparece mais de uma vez.`, tone: 'rose' }); return; }
      if (e.position < 1 || e.position > maxPosition) { push({ title: 'Posição inválida', body: `${e.driverName}: posição ${e.position}. A lista é até ${maxPosition}.`, tone: 'rose' }); return; }
      positions.add(e.position);
    }

    setApplying(true);
    try {
      const result = await api.post<{
        created: number;
        reused: number;
        updated: number;
        removed: number;
        total: number;
      }>(ENDPOINTS.BRAZIL_LISTS.rosters.bulkReplace(listId), { entries });
      push({
        title: 'Roster atualizado',
        body: `${result.total} pilotos · ${result.created} novos, ${result.reused} reaproveitados, ${result.updated} atualizados, ${result.removed} removidos.`,
        tone: 'emerald',
      });
      onApplied();
    } catch (e) {
      push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-4 sm:p-6 w-full max-w-3xl max-h-[92dvh] overflow-hidden flex flex-col">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <I.Upload size={18}/>
          </div>
          <div className="flex-1">
            <div className="font-display text-[18px] font-bold">Importar roster (PDF / DOCX)</div>
            <div className="text-[12px] text-[color:var(--text-3)]">
              Sobe o arquivo, revisa o que o parser leu e clica em aplicar. Substitui o roster atual da lista.
              Pilotos retirados saem só desta lista — o cadastro do piloto permanece no banco.
            </div>
          </div>
        </div>

        {!entries && (
          <div className="rounded-[12px] border-2 border-dashed p-8 text-center" style={{ borderColor: 'var(--border)' }}>
            <I.Upload size={28} stroke={1.4}/>
            <p className="mt-3 text-[13px] text-[color:var(--text-2)]">
              Selecione o arquivo da lista <strong>(.pdf, .docx)</strong> — máx. 5MB
            </p>
            <label className="btn btn-primary mt-4 inline-flex cursor-pointer">
              <I.Upload size={14}/> Escolher arquivo
              <input
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={onFileChange}
                disabled={parsing}
              />
            </label>
            {file && parsing && (
              <p className="mt-3 text-[12px] text-[color:var(--text-3)]"><span className="pulse-dot"/> Lendo {file.name}…</p>
            )}
            {error && (
              <p className="mt-3 text-[12px]" style={{ color: '#ff7585' }}>{error}</p>
            )}
          </div>
        )}

        {entries && (
          <>
            <div className="rounded-[10px] px-3 py-2 mb-3 text-[12px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              ✓ {entries.length} piloto(s) reconhecido(s). Revise abaixo — ao aplicar, o roster atual da lista é substituído.
            </div>
            <div className="table-wrap overflow-y-auto flex-1 -mx-2 px-2">
              <table className="w-full" style={{ minWidth: 700 }}>
                <thead className="sticky top-0 z-10" style={{ background: 'var(--surface)' }}>
                  <tr>
                    <th style={{ paddingLeft: 8, width: 60 }}>#</th>
                    <th>Piloto</th>
                    <th>Apelido</th>
                    <th>Carro</th>
                    <th style={{ width: 80 }}>Nº</th>
                    <th style={{ paddingRight: 8, width: 50 }}/>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, idx) => (
                    <tr key={idx}>
                      <td style={{ paddingLeft: 8 }}>
                        <input
                          type="number"
                          className="input"
                          value={e.position}
                          min={1}
                          max={maxPosition}
                          onChange={(ev) => updateEntry(idx, { position: Math.max(1, Number(ev.target.value) || 1) })}
                          style={{ width: 60 }}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="input"
                          value={e.driverName}
                          onChange={(ev) => updateEntry(idx, { driverName: ev.target.value })}
                          placeholder="Nome do piloto"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="input"
                          value={e.nickname ?? ''}
                          onChange={(ev) => updateEntry(idx, { nickname: ev.target.value || null })}
                          placeholder="—"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="input"
                          value={e.carName ?? ''}
                          onChange={(ev) => updateEntry(idx, { carName: ev.target.value || null })}
                          placeholder="—"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="input"
                          value={e.carNumber ?? ''}
                          onChange={(ev) => updateEntry(idx, { carNumber: ev.target.value || null })}
                          placeholder="—"
                        />
                      </td>
                      <td style={{ paddingRight: 8 }}>
                        <button className="btn-icon" onClick={() => removeEntry(idx)} title="Remover do preview" style={{ color: '#ff7585' }}>
                          <I.Trash size={15}/>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={parsing || applying}>
            Cancelar
          </button>
          {entries && (
            <>
              <button className="btn btn-ghost" onClick={() => { setEntries(null); setFile(null); }} disabled={applying}>
                Trocar arquivo
              </button>
              <button
                className="btn btn-primary flex-[2] justify-center"
                onClick={apply}
                disabled={applying || entries.length === 0}
              >
                {applying ? <><span className="pulse-dot"/> Aplicando…</> : <><I.Check size={14}/> Substituir roster ({entries.length} pilotos)</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
