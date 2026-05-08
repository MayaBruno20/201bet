'use client';

import * as React from 'react';
import { I } from '@/components/ui/icons';
import { Page, Card, StatusChip } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { DatePicker } from '@/components/ui/datepicker';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/lib/endpoints';
import { ArmageddonEventDetail } from '@/components/admin/armageddon-event-detail';

type ArmageddonEvent = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  scheduledAt: string;
  endsAt: string | null;
  notes?: string | null;
};

export default function ArmageddonPage() {
  const [events, setEvents] = React.useState<ArmageddonEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<ArmageddonEvent | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', description: '', scheduledAt: '', endsAt: '', notes: '' });
  const { push } = useToast();
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.get<ArmageddonEvent[]>(ENDPOINTS.ARMAGEDDON.list);
      setEvents(list);
      if (!selected && list.length > 0) setSelected(list[0]);
    } catch (e) {
      push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' });
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!form.name.trim() || !form.scheduledAt) { push({ title: 'Nome e início são obrigatórios', tone: 'rose' }); return; }
    setBusy(true);
    try {
      const created = await api.post<ArmageddonEvent>(ENDPOINTS.ARMAGEDDON.create, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        scheduledAt: form.scheduledAt,
        endsAt: form.endsAt || undefined,
        notes: form.notes.trim() || undefined,
      });
      push({ title: 'Armageddon criado', body: form.name, tone: 'emerald' });
      setForm({ name: '', description: '', scheduledAt: '', endsAt: '', notes: '' });
      setCreateOpen(false);
      await load();
      setSelected(created);
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  const cancelEvent = async (e: ArmageddonEvent) => {
    const ok = await confirm({
      title: 'Cancelar Armageddon?',
      body: <>Vai cancelar <strong>{e.name}</strong>. Inscritos e mercados em aberto serão afetados.</>,
      tone: 'danger',
      confirmLabel: 'Cancelar evento',
      icon: 'Trash',
    });
    if (!ok) return;
    try {
      await api.del(ENDPOINTS.ARMAGEDDON.delete(e.id));
      push({ title: 'Cancelado', body: e.name, tone: 'amber' });
      setSelected(null);
      await load();
    } catch (err) { push({ title: 'Erro', body: err instanceof Error ? err.message : '', tone: 'rose' }); }
  };

  return (
    <Page eyebrow="Operação · Eventos" title="Armageddon"
      sub="Eventos nacionais de eliminação. Lista de inscritos vem das Listas Brasil."
      actions={<>
        <button className="btn btn-ghost focusable" onClick={load}><I.Activity size={15}/> Atualizar</button>
        <button className="btn btn-primary focusable" onClick={() => setCreateOpen(true)}>
          <I.Plus size={15}/> Novo Armageddon
        </button>
      </>}>
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-4">
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="text-[12px] font-semibold">Eventos <span className="text-[color:var(--text-3)]">({events.length})</span></div>
            </div>
            {loading && <div className="p-6 text-center text-[12.5px] text-[color:var(--text-3)]">Carregando…</div>}
            {!loading && events.length === 0 && <div className="p-6 text-center text-[12.5px] text-[color:var(--text-3)]">Nenhum Armageddon ainda.</div>}
            <div className="p-2 space-y-1 max-h-[600px] overflow-auto">
              {events.map((e) => (
                <button key={e.id} onClick={() => setSelected(e)}
                  className="w-full text-left px-3 py-2.5 rounded-[12px] flex flex-col gap-0.5"
                  style={{
                    background: selected?.id === e.id ? 'var(--surface-2)' : 'transparent',
                    border: '1px solid ' + (selected?.id === e.id ? 'var(--border-strong)' : 'transparent'),
                  }}>
                  <div className="font-semibold text-[13px] truncate">{e.name}</div>
                  <div className="text-[11px] text-[color:var(--text-3)] flex items-center gap-2">
                    <span>{new Date(e.scheduledAt).toLocaleDateString('pt-BR')}</span>
                    <StatusChip status={e.status === 'IN_PROGRESS' ? 'AO VIVO' : e.status === 'FINISHED' ? 'ENCERRADO' : e.status === 'CANCELED' ? 'CANCELADO' : 'AGENDADO'}/>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-8">
          {selected ? (
            <div className="space-y-5">
              <Card className="p-5">
                <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-1">Armageddon</div>
                <div className="flex items-end justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-display text-[24px] font-bold">{selected.name}</div>
                    <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">
                      {new Date(selected.scheduledAt).toLocaleString('pt-BR')}
                      {selected.endsAt && ` — ${new Date(selected.endsAt).toLocaleString('pt-BR')}`}
                    </div>
                    {selected.description && <div className="text-[12px] text-[color:var(--text-2)] mt-2">{selected.description}</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusChip status={selected.status === 'IN_PROGRESS' ? 'AO VIVO' : selected.status === 'FINISHED' ? 'ENCERRADO' : selected.status === 'CANCELED' ? 'CANCELADO' : 'AGENDADO'}/>
                    {selected.status !== 'CANCELED' && (
                      <button className="btn btn-ghost focusable" onClick={() => cancelEvent(selected)} style={{ color: '#ff7585' }}>
                        <I.Trash size={14}/> Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </Card>

              <ArmageddonEventDetail key={selected.id} eventId={selected.id} onChanged={load}/>
            </div>
          ) : (
            <Card className="p-16 text-center">
              <div className="w-14 h-14 rounded-[14px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)' }}>
                <I.Flame size={22} style={{ color: 'var(--text-3)' }}/>
              </div>
              <div className="font-display text-[16px] font-semibold mt-3">Selecione um Armageddon</div>
              <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">Ou clique em "Novo Armageddon".</div>
            </Card>
          )}
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
          <div className="surface-elev p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--rose-soft)', color: '#ff7585' }}>
                <I.Flame size={18}/>
              </div>
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">Novo Armageddon</div>
                <div className="text-[12px] text-[color:var(--text-3)]">Evento nacional. Pilotos vêm das Listas Brasil.</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nome *</label>
                <input className="input mt-1" autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}/>
              </div>
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Descrição</label>
                <textarea className="input mt-1" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Início *</label>
                  <div className="mt-1">
                    <DatePicker value={form.scheduledAt} onChange={(v) => setForm((f) => ({ ...f, scheduledAt: v }))} placeholder="Data e hora"/>
                  </div>
                </div>
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Fim</label>
                  <div className="mt-1">
                    <DatePicker value={form.endsAt} onChange={(v) => setForm((f) => ({ ...f, endsAt: v }))} placeholder="Opcional"/>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Notas internas</label>
                <textarea className="input mt-1" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}/>
              </div>
            </div>

            <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost flex-1 justify-center" onClick={() => setCreateOpen(false)} disabled={busy}>Cancelar</button>
              <button className="btn btn-primary flex-1 justify-center" onClick={create} disabled={busy}>
                {busy ? <><span className="pulse-dot"/> Criando…</> : <><I.Check size={14}/> Criar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
