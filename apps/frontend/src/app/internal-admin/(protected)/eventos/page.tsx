'use client';

import * as React from 'react';
import Link from 'next/link';
import { I } from '@admin/components/ui/icons';
import { Page, Card, SectionTitle, StatusChip } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm } from '@admin/components/ui/confirm';
import { DatePicker } from '@admin/components/ui/datepicker';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';
import { CopaEventDetail } from '@admin/components/admin/copa-event-detail';

type CategoryEvent = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  scheduledAt: string;
  endsAt: string | null;
  bracketsCount?: number;
  totalCompetitors?: number;
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

export default function EventosPage() {
  const [events, setEvents] = React.useState<CategoryEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [selected, setSelected] = React.useState<CategoryEvent | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  // Aba global do painel: separar eventos vivos/agendados dos finalizados — o
  // usuário pediu pra não confundir histórico com operação corrente.
  const [tab, setTab] = React.useState<'active' | 'finished'>('active');
  const { push } = useToast();
  const confirm = useConfirm();

  const [form, setForm] = React.useState({
    name: '',
    description: '',
    scheduledAt: '',
    endsAt: '',
    selectedCategories: [] as string[],
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.get<CategoryEvent[]>(ENDPOINTS.CATEGORY_EVENTS.list);
      setEvents(list);
      if (!selected && list.length > 0) setSelected(list[0]);
    } catch (e) {
      push({ title: 'Erro ao carregar eventos', body: e instanceof Error ? e.message : '', tone: 'rose' });
    } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  // Filtra lista lateral conforme a aba ativa. Quando o usuário troca pra
  // "Finalizados", a seleção do painel direito atualiza automaticamente para
  // o 1º evento da nova lista — evitando "estado fantasma" mostrando um
  // evento agendado no painel "Finalizados".
  const activeEvents = events.filter((e) => e.status !== 'FINISHED' && e.status !== 'CANCELED');
  const finishedEvents = events.filter((e) => e.status === 'FINISHED');
  const visibleEvents = tab === 'active' ? activeEvents : finishedEvents;

  React.useEffect(() => {
    if (visibleEvents.length === 0) {
      if (selected) setSelected(null);
      return;
    }
    if (!selected || !visibleEvents.some((e) => e.id === selected.id)) {
      setSelected(visibleEvents[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, events]);

  const create = async () => {
    if (!form.name.trim() || !form.scheduledAt) {
      push({ title: 'Informe nome e data de início', tone: 'rose' }); return;
    }
    setBusy(true);
    try {
      const created = await api.post<CategoryEvent>(ENDPOINTS.CATEGORY_EVENTS.create, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        scheduledAt: form.scheduledAt,
        endsAt: form.endsAt || undefined,
        categories: form.selectedCategories.length > 0 ? form.selectedCategories : undefined,
      });
      push({ title: 'Evento criado', body: form.name, tone: 'emerald' });
      setForm({ name: '', description: '', scheduledAt: '', endsAt: '', selectedCategories: [] });
      setCreateOpen(false);
      await load();
      setSelected(created);
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  const cancelEvent = async (e: CategoryEvent) => {
    const ok = await confirm({
      title: 'Cancelar evento?',
      body: <>Vai cancelar <strong>{e.name}</strong>. Some do site público mas o histórico continua disponível.</>,
      tone: 'danger',
      confirmLabel: 'Cancelar evento',
      icon: 'Trash',
    });
    if (!ok) return;
    try {
      await api.del(ENDPOINTS.CATEGORY_EVENTS.delete(e.id));
      push({ title: 'Evento cancelado', body: e.name, tone: 'amber' });
      setSelected(null);
      await load();
    } catch (err) { push({ title: 'Erro', body: err instanceof Error ? err.message : '', tone: 'rose' }); }
  };

  const toggleCategory = (val: string) => {
    setForm((f) => ({
      ...f,
      selectedCategories: f.selectedCategories.includes(val)
        ? f.selectedCategories.filter((v) => v !== val)
        : [...f.selectedCategories, val],
    }));
  };

  return (
    <Page eyebrow="Operação · Eventos" title="Copa Categorias"
      sub="Eventos por categoria de tempo. Crie, audite confrontos e cancele."
      actions={<>
        <Link href="/listas" className="btn btn-ghost focusable"><I.Layers size={15}/> Listas Brasil</Link>
        <Link href="/armageddon" className="btn btn-ghost focusable"><I.Flame size={15}/> Armageddon</Link>
        <button className="btn btn-primary focusable" onClick={() => setCreateOpen(true)}>
          <I.Plus size={15}/> Novo evento
        </button>
      </>}>
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-4">
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1 surface-2 rounded-[10px] p-1 mb-2" style={{ background: 'var(--surface-2)' }}>
                <button
                  onClick={() => setTab('active')}
                  className="flex-1 px-3 py-1.5 text-[11.5px] font-semibold rounded-[8px]"
                  style={{
                    background: tab === 'active' ? 'var(--surface-3)' : 'transparent',
                    color: tab === 'active' ? 'var(--text)' : 'var(--text-3)',
                  }}
                >
                  Ativos ({activeEvents.length})
                </button>
                <button
                  onClick={() => setTab('finished')}
                  className="flex-1 px-3 py-1.5 text-[11.5px] font-semibold rounded-[8px]"
                  style={{
                    background: tab === 'finished' ? 'var(--surface-3)' : 'transparent',
                    color: tab === 'finished' ? 'var(--text)' : 'var(--text-3)',
                  }}
                >
                  Finalizados ({finishedEvents.length})
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-[color:var(--text-3)]">
                  {tab === 'active' ? 'Em operação e agendados' : 'Histórico de eventos encerrados'}
                </div>
                <button className="btn-icon focusable" onClick={load} title="Atualizar"><I.Activity size={15}/></button>
              </div>
            </div>
            {loading && <div className="p-6 text-center text-[12.5px] text-[color:var(--text-3)]">Carregando…</div>}
            {!loading && visibleEvents.length === 0 && (
              <div className="p-6 text-center text-[12.5px] text-[color:var(--text-3)]">
                {tab === 'finished' ? 'Nenhum evento finalizado ainda.' : 'Nenhum evento. Clique em "Novo evento".'}
              </div>
            )}
            <div className="p-2 space-y-1 max-h-[600px] overflow-auto">
              {visibleEvents.map((e) => (
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
                <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-1">Evento</div>
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

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5">
                  <div className="surface-2 p-4">
                    <div className="text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--text-3)] font-semibold">Categorias</div>
                    <div className="font-display text-[22px] font-bold mt-1">{selected.bracketsCount ?? '—'}</div>
                  </div>
                  <div className="surface-2 p-4">
                    <div className="text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--text-3)] font-semibold">Inscritos</div>
                    <div className="font-display text-[22px] font-bold mt-1">{selected.totalCompetitors ?? '—'}</div>
                  </div>
                  <div className="surface-2 p-4">
                    <div className="text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--text-3)] font-semibold">ID</div>
                    <div className="font-mono text-[11px] mt-1 text-[color:var(--text-2)] break-all">{selected.id}</div>
                  </div>
                </div>
              </Card>

              <CopaEventDetail key={selected.id} eventId={selected.id} onChanged={load}/>
            </div>
          ) : (
            <Card className="p-16 text-center">
              <div className="w-14 h-14 rounded-[14px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)' }}>
                <I.Trophy size={22} style={{ color: 'var(--text-3)' }}/>
              </div>
              <div className="font-display text-[16px] font-semibold mt-3">Selecione um evento</div>
              <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">Ou clique em "Novo evento" para criar um.</div>
            </Card>
          )}
        </div>
      </div>

      {/* ── Modal Criar Evento ── */}
      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
          <div className="surface-elev p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <I.Trophy size={18}/>
              </div>
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">Novo evento</div>
                <div className="text-[12px] text-[color:var(--text-3)]">Copa Categorias — escolha as categorias que vão participar.</div>
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
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] block mb-2">Categorias incluídas (opcional)</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {CATEGORIES.map((c) => {
                    const active = form.selectedCategories.includes(c.value);
                    return (
                      <button key={c.value} type="button" onClick={() => toggleCategory(c.value)}
                        className="rounded-[10px] px-2 py-1.5 text-[11.5px] font-bold"
                        style={{
                          background: active ? 'var(--accent-soft)' : 'var(--surface-2)',
                          color: active ? 'var(--accent)' : 'var(--text-2)',
                          border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                        }}>
                        {c.label}
                      </button>
                    );
                  })}
                </div>
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
