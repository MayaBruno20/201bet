'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Page, Card, StatusChip } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm } from '@admin/components/ui/confirm';
import { DatePicker } from '@admin/components/ui/datepicker';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';

type DriverLite = { id: string; name: string; isGuest: boolean };

type QuickDuel = {
  id: string;
  status: 'SCHEDULED' | 'BOOKING_OPEN' | 'BOOKING_CLOSED' | 'FINISHED' | 'CANCELED';
  startsAt: string;
  bookingCloseAt: string;
  notes: string | null;
  leftDriver: DriverLite;
  rightDriver: DriverLite;
  market: { id: string; status: string; winnerOddId: string | null; odds: Array<{ id: string; label: string; value: number; status: string }> } | null;
  pool: { left: number; right: number; tickets: number } | null;
  createdAt: string;
};

type Driver = { id: string; name: string; isGuest?: boolean };

const STATUS_LABEL: Record<QuickDuel['status'], string> = {
  SCHEDULED: 'Agendado',
  BOOKING_OPEN: 'Mercado aberto',
  BOOKING_CLOSED: 'Mercado fechado',
  FINISHED: 'Auditado',
  CANCELED: 'Cancelado',
};

export default function EmbatesRapidosPage() {
  const [duels, setDuels] = React.useState<QuickDuel[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [settleFor, setSettleFor] = React.useState<QuickDuel | null>(null);
  const { push } = useToast();
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setDuels(await api.get<QuickDuel[]>(ENDPOINTS.QUICK_DUELS.list)); }
    catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setLoading(false); }
  }, [push]);
  React.useEffect(() => { void load(); }, [load]);

  const closeBooking = async (d: QuickDuel) => {
    const ok = await confirm({
      title: 'Fechar mercado?',
      body: <>Apostas em <strong>{d.leftDriver.name} × {d.rightDriver.name}</strong> serão suspensas. Reabrir só via novo embate.</>,
      tone: 'warning',
      confirmLabel: 'Fechar mercado',
      icon: 'Pause',
    });
    if (!ok) return;
    setBusy(d.id);
    try {
      await api.post(ENDPOINTS.QUICK_DUELS.closeBooking(d.id));
      push({ title: 'Mercado fechado', tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const cancel = async (d: QuickDuel) => {
    const ok = await confirm({
      title: 'Cancelar embate?',
      body: 'Apostas em aberto serão reembolsadas automaticamente.',
      tone: 'danger',
      confirmLabel: 'Cancelar embate',
      icon: 'AlertTriangle',
    });
    if (!ok) return;
    setBusy(d.id);
    try {
      await api.post(ENDPOINTS.QUICK_DUELS.cancel(d.id));
      push({ title: 'Embate cancelado', tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const open = duels.filter((d) => d.status === 'BOOKING_OPEN').length;
  const closed = duels.filter((d) => d.status === 'BOOKING_CLOSED').length;
  const settled = duels.filter((d) => d.status === 'FINISHED').length;

  return (
    <Page eyebrow="Operação · Embates rápidos" title="Embates Rápidos"
      sub="Duelos one-off para pilotos convidados. Não passam por bracket de Lista — vão direto pro evento curinga."
      actions={
        <>
          <button className="btn btn-ghost focusable" onClick={load}><I.Activity size={15}/> Atualizar</button>
          <button className="btn btn-primary focusable" onClick={() => setCreateOpen(true)}>
            <I.Plus size={15}/> Novo embate
          </button>
        </>
      }>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <Card className="p-4">
          <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Total</div>
          <div className="font-display text-[24px] font-bold mt-1 tabular-nums">{duels.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Mercado aberto</div>
          <div className="font-display text-[24px] font-bold mt-1 tabular-nums" style={{ color: 'var(--emerald)' }}>{open}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Fechados</div>
          <div className="font-display text-[24px] font-bold mt-1 tabular-nums" style={{ color: 'var(--accent)' }}>{closed}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Auditados</div>
          <div className="font-display text-[24px] font-bold mt-1 tabular-nums" style={{ color: 'var(--text-2)' }}>{settled}</div>
        </Card>
      </div>

      {loading && <Card className="p-8 sm:p-12 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</Card>}

      {!loading && duels.length === 0 && (
        <Card className="p-10 sm:p-16 text-center">
          <div className="w-14 h-14 rounded-[14px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)' }}>
            <I.Bolt size={22} style={{ color: 'var(--text-3)' }}/>
          </div>
          <div className="font-display text-[16px] font-semibold mt-3">Nenhum embate rápido</div>
          <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">Clique em "Novo embate" para criar o primeiro.</div>
        </Card>
      )}

      <div className="space-y-2">
        {duels.map((d) => (
          <Card key={d.id} className="p-4">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="w-11 h-11 rounded-[12px] grid place-items-center shrink-0"
                style={{
                  background: d.status === 'BOOKING_OPEN' ? 'var(--emerald-soft)'
                    : d.status === 'FINISHED' ? 'var(--surface-3)'
                    : d.status === 'CANCELED' ? 'var(--rose-soft)'
                    : 'var(--accent-soft)',
                  color: d.status === 'BOOKING_OPEN' ? 'var(--emerald)'
                    : d.status === 'FINISHED' ? 'var(--text-2)'
                    : d.status === 'CANCELED' ? 'var(--rose)'
                    : 'var(--accent)',
                }}>
                <I.Bolt size={18}/>
              </div>

              <div className="flex-1 min-w-[min(260px,100%)]">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <StatusChip status={STATUS_LABEL[d.status]}/>
                  {d.market?.winnerOddId && (
                    <span className="chip" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
                      VENCEDOR · {d.market.odds.find((o) => o.id === d.market!.winnerOddId)?.label ?? ''}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <DriverSide driver={d.leftDriver} won={d.market?.winnerOddId === d.market?.odds[0]?.id} alignRight/>
                  <div className="text-center text-[10.5px] font-bold tracking-[0.18em] uppercase" style={{ color: 'var(--text-3)' }}>VS</div>
                  <DriverSide driver={d.rightDriver} won={d.market?.winnerOddId === d.market?.odds[1]?.id}/>
                </div>
                <div className="text-[11px] text-[color:var(--text-3)] mt-2">
                  Início: {new Date(d.startsAt).toLocaleString('pt-BR')}
                  {' · '}Fechamento: {new Date(d.bookingCloseAt).toLocaleString('pt-BR')}
                  {d.pool && (d.pool.left + d.pool.right) > 0 && (
                    <span> · Pool: R$ {(d.pool.left + d.pool.right).toFixed(2)} ({d.pool.tickets} apostas)</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                {d.status === 'BOOKING_OPEN' && (
                  <button className="btn" disabled={busy === d.id} onClick={() => void closeBooking(d)} style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    <I.Pause size={13}/> Fechar mercado
                  </button>
                )}
                {(d.status === 'BOOKING_OPEN' || d.status === 'BOOKING_CLOSED') && (
                  <button className="btn btn-primary" disabled={busy === d.id} onClick={() => setSettleFor(d)}>
                    <I.Check size={13}/> Auditar
                  </button>
                )}
                {d.status !== 'FINISHED' && d.status !== 'CANCELED' && (
                  <button className="btn-icon" disabled={busy === d.id} onClick={() => void cancel(d)} title="Cancelar embate" style={{ color: '#ff7585' }}>
                    <I.Trash size={14}/>
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {createOpen && (
        <CreateQuickDuelModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); void load(); }}
        />
      )}

      {settleFor && (
        <SettleQuickDuelModal
          duel={settleFor}
          onClose={() => setSettleFor(null)}
          onSaved={() => { setSettleFor(null); void load(); }}
        />
      )}
    </Page>
  );
}

const DriverSide: React.FC<{ driver: DriverLite; won?: boolean; alignRight?: boolean }> = ({ driver, won, alignRight }) => (
  <div className={`flex items-center gap-2 min-w-0 ${alignRight ? 'justify-end text-right' : ''}`}>
    {alignRight && won && <span className="chip shrink-0" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>VENCEU</span>}
    <div className="min-w-0">
      <div className="font-semibold text-[13.5px] truncate flex items-center gap-1.5" style={{ justifyContent: alignRight ? 'flex-end' : 'flex-start' }}>
        {driver.name}
        {driver.isGuest && (
          <span className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 9 }}>CONVIDADO</span>
        )}
      </div>
    </div>
    {!alignRight && won && <span className="chip shrink-0" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>VENCEU</span>}
  </div>
);

function CreateQuickDuelModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [leftMode, setLeftMode] = React.useState<'existing' | 'guest'>('existing');
  const [rightMode, setRightMode] = React.useState<'existing' | 'guest'>('existing');
  const [leftId, setLeftId] = React.useState('');
  const [leftName, setLeftName] = React.useState('');
  const [rightId, setRightId] = React.useState('');
  const [rightName, setRightName] = React.useState('');
  const [scheduledAt, setScheduledAt] = React.useState('');
  const [bookingCloseAt, setBookingCloseAt] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  React.useEffect(() => {
    api.get<Driver[]>(ENDPOINTS.DRIVERS.list).then(setDrivers).catch(() => undefined);
  }, []);

  const submit = async () => {
    if (!scheduledAt) { push({ title: 'Defina horário de início', tone: 'rose' }); return; }
    const leftPayload = leftMode === 'existing'
      ? (leftId ? { id: leftId } : null)
      : (leftName.trim() ? { name: leftName.trim() } : null);
    const rightPayload = rightMode === 'existing'
      ? (rightId ? { id: rightId } : null)
      : (rightName.trim() ? { name: rightName.trim() } : null);
    if (!leftPayload || !rightPayload) {
      push({ title: 'Informe os dois pilotos', tone: 'rose' }); return;
    }
    setBusy(true);
    try {
      await api.post(ENDPOINTS.QUICK_DUELS.create, {
        leftDriver: leftPayload,
        rightDriver: rightPayload,
        scheduledAt,
        bookingCloseAt: bookingCloseAt || undefined,
        notes: notes.trim() || undefined,
      });
      push({ title: 'Embate criado', body: 'Mercado já está aberto.', tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] cmdk-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div className="surface-elev p-4 sm:p-6 w-full max-w-2xl max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <I.Bolt size={18}/>
          </div>
          <div>
            <div className="font-display text-[18px] font-bold">Novo embate rápido</div>
            <div className="text-[12px] text-[color:var(--text-3)]">Mercado já abre na criação. Use pilotos existentes ou nomeie um convidado one-off.</div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <DriverPicker
            label="Piloto esquerda *"
            mode={leftMode} setMode={setLeftMode}
            id={leftId} setId={setLeftId}
            name={leftName} setName={setLeftName}
            drivers={drivers}
          />
          <DriverPicker
            label="Piloto direita *"
            mode={rightMode} setMode={setRightMode}
            id={rightId} setId={setRightId}
            name={rightName} setName={setRightName}
            drivers={drivers}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Início *</label>
            <div className="mt-1">
              <DatePicker value={scheduledAt} onChange={setScheduledAt} placeholder="Data e hora"/>
            </div>
          </div>
          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Fechar booking em</label>
            <div className="mt-1">
              <DatePicker value={bookingCloseAt} onChange={setBookingCloseAt} placeholder="Default: +1h após início"/>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Notas (opcional)</label>
          <input className="input mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: Evento promocional, desafio de fãs…"/>
        </div>

        <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Criando…</> : <><I.Check size={14}/> Criar e abrir mercado</>}
          </button>
        </div>
      </div>
    </div>
  );
}

const DriverPicker: React.FC<{
  label: string;
  mode: 'existing' | 'guest';
  setMode: (m: 'existing' | 'guest') => void;
  id: string;
  setId: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  drivers: Driver[];
}> = ({ label, mode, setMode, id, setId, name, setName, drivers }) => (
  <div className="surface-2 p-3" style={{ borderRadius: 12 }}>
    <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">{label}</label>
    <div className="flex gap-1 mt-1.5 mb-2">
      <button
        className={`tab ${mode === 'existing' ? 'active' : ''}`}
        onClick={() => setMode('existing')}
      >
        Cadastrado
      </button>
      <button
        className={`tab ${mode === 'guest' ? 'active' : ''}`}
        onClick={() => setMode('guest')}
      >
        Convidado
      </button>
    </div>
    {mode === 'existing' ? (
      <select className="input" value={id} onChange={(e) => setId(e.target.value)}>
        <option value="">Selecione…</option>
        {drivers.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}{d.isGuest ? ' (convidado)' : ''}
          </option>
        ))}
      </select>
    ) : (
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do piloto convidado"/>
    )}
  </div>
);

function SettleQuickDuelModal({ duel, onClose, onSaved }: { duel: QuickDuel; onClose: () => void; onSaved: () => void }) {
  const [winningSide, setWinningSide] = React.useState<'LEFT' | 'RIGHT'>('LEFT');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(ENDPOINTS.QUICK_DUELS.settle(duel.id), { winningSide });
      push({ title: 'Embate auditado', body: `Vencedor: ${winningSide === 'LEFT' ? duel.leftDriver.name : duel.rightDriver.name}`, tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] cmdk-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div className="surface-elev p-4 sm:p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
            <I.Check size={18}/>
          </div>
          <div>
            <div className="font-display text-[18px] font-bold">Auditar vencedor</div>
            <div className="text-[12px] text-[color:var(--text-3)]">Apostas em aberto serão liquidadas e o saldo dos vencedores creditado.</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {(['LEFT', 'RIGHT'] as const).map((side) => {
            const driver = side === 'LEFT' ? duel.leftDriver : duel.rightDriver;
            const selected = winningSide === side;
            return (
              <button
                key={side}
                onClick={() => setWinningSide(side)}
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
                <div className="font-semibold text-[13px] truncate">{driver.name}</div>
                {driver.isGuest && <div className="text-[10.5px] mt-0.5" style={{ opacity: 0.7 }}>convidado</div>}
              </button>
            );
          })}
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
