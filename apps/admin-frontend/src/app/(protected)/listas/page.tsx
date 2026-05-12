'use client';

import * as React from 'react';
import { I } from '@/components/ui/icons';
import { Page, Card, SectionTitle, StatusChip } from '@/components/ui/primitives';
import { fetchLists, type ListItem } from '@/lib/data';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/lib/endpoints';
import { BrazilListDetail } from '@/components/admin/brazil-list-detail';

export default function ListasPage() {
  const [lists, setLists] = React.useState<ListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<ListItem | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [togglingActive, setTogglingActive] = React.useState(false);
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [form, setForm] = React.useState({ areaCode: '', format: 'TOP_20' as 'TOP_10' | 'TOP_20', name: '', hometown: '', administratorName: '' });
  const { push } = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await fetchLists();
      setLists(fresh);
      // Mantém a lista selecionada atualizada (status/pilots/etc) sem perder a seleção
      setSelected((prev) => (prev?.id ? fresh.find((l) => l.id === prev.id) ?? prev : prev));
    }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const toggleActive = async () => {
    if (!selected?.id || togglingActive) return;
    setTogglingActive(true);
    try {
      const nextActive = !selected.active;
      await api.patch(ENDPOINTS.BRAZIL_LISTS.update(selected.id), { active: nextActive });
      push({ title: nextActive ? 'Lista ativada' : 'Lista pausada', tone: nextActive ? 'emerald' : 'amber' });
      await load();
    } catch (e) {
      push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' });
    } finally {
      setTogglingActive(false);
    }
  };

  const create = async () => {
    if (!form.areaCode.trim()) { push({ title: 'Informe o DDD', tone: 'rose' }); return; }
    setBusy(true);
    try {
      await api.post(ENDPOINTS.BRAZIL_LISTS.create, {
        areaCode: Number(form.areaCode),
        format: form.format,
        name: form.name.trim() || undefined,
        hometown: form.hometown.trim() || undefined,
        administratorName: form.administratorName.trim() || undefined,
      });
      push({ title: 'Lista criada', body: `DDD ${form.areaCode}`, tone: 'emerald' });
      setForm({ areaCode: '', format: 'TOP_20', name: '', hometown: '', administratorName: '' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <Page eyebrow="Operação" title="Listas Brasil"
      sub="Gerencie listas por DDD, pilotos do TOP 10/20, eventos e chaves PAR/ÍMPAR."
      actions={<button className="btn btn-ghost focusable" onClick={load}><I.Activity size={15}/> Atualizar</button>}>
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Card className="p-4">
            <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-3">Nova lista</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <input className="input" placeholder="DDD (ex: 43)" value={form.areaCode} onChange={(e) => setForm((f) => ({ ...f, areaCode: e.target.value.replace(/\D/g, '') }))}/>
              <select className="input" value={form.format} onChange={(e) => setForm((f) => ({ ...f, format: e.target.value as 'TOP_10' | 'TOP_20' }))}>
                <option value="TOP_20">TOP 20</option>
                <option value="TOP_10">TOP 10</option>
              </select>
            </div>
            <input className="input mb-2" placeholder="Nome (opcional)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}/>
            <input className="input mb-2" placeholder="Cidade sede" value={form.hometown} onChange={(e) => setForm((f) => ({ ...f, hometown: e.target.value }))}/>
            <input className="input mb-3" placeholder="Administrador" value={form.administratorName} onChange={(e) => setForm((f) => ({ ...f, administratorName: e.target.value }))}/>
            <button className="btn btn-primary w-full justify-center" onClick={create} disabled={busy || !form.areaCode}>
              {busy ? <><span className="pulse-dot"/> Criando…</> : <><I.Plus size={14}/> Criar</>}
            </button>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="text-[12px] font-semibold">Listas <span className="text-[color:var(--text-3)]">({lists.length})</span></div>
              <div className="relative">
                <I.Search size={13} style={{ position: 'absolute', left: 9, top: 8, color: 'var(--text-3)' }}/>
                <input className="input pl-7 py-1 text-[12px]" style={{ width: 140 }} placeholder="DDD"/>
              </div>
            </div>
            <div className="p-2 space-y-1 max-h-[600px] overflow-auto">
              {lists.map((l) => (
                <button key={l.ddd} onClick={() => setSelected(l)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[12px] text-left"
                  style={{
                    background: selected?.ddd === l.ddd ? 'var(--surface-2)' : 'transparent',
                    border: '1px solid ' + (selected?.ddd === l.ddd ? 'var(--border-strong)' : 'transparent'),
                  }}>
                  <div className="w-10 h-10 rounded-[10px] grid place-items-center font-display font-bold text-[14px] tabular-nums shrink-0"
                    style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}>{l.ddd}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-[13px] truncate">{l.name}</div>
                    <div className="text-[11px] text-[color:var(--text-3)]">{l.tier} · {l.pilots} pilotos · {l.sede}</div>
                  </div>
                  <StatusChip status={l.status}/>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-8">
          {selected ? (
            <div className="space-y-5">
              <Card className="p-5">
                <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Lista · DDD {selected.ddd}</div>
                <div className="flex items-end justify-between gap-3 flex-wrap mt-1">
                  <div>
                    <div className="font-display text-[24px] font-bold">{selected.name}</div>
                    <div className="text-[12.5px] text-[color:var(--text-3)] mt-0.5">{selected.tier} · {selected.pilots} pilotos · sede {selected.sede} · atualizada {selected.updated}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip status={selected.status}/>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setEditModalOpen(true)}
                      disabled={!selected.id}
                    >
                      <I.Edit size={14}/> Editar
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={toggleActive}
                      disabled={!selected.id || togglingActive}
                      style={selected.active ? undefined : { color: 'var(--emerald)' }}
                    >
                      {togglingActive
                        ? <><span className="pulse-dot"/> {selected.active ? 'Pausando…' : 'Ativando…'}</>
                        : selected.active
                          ? <><I.Pause size={14}/> Pausar</>
                          : <><I.Play size={14}/> Ativar</>}
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5">
                  <div className="surface-2 p-4">
                    <div className="text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--text-3)] font-semibold">Pilotos</div>
                    <div className="font-display text-[22px] font-bold mt-1">{selected.pilots}</div>
                    <div className="progress mt-2"><span style={{ width: `${(selected.pilots / (selected.tier === 'TOP 10' ? 10 : 20)) * 100}%` }}/></div>
                  </div>
                  <div className="surface-2 p-4">
                    <div className="text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--text-3)] font-semibold">Formato</div>
                    <div className="font-display text-[22px] font-bold mt-1">{selected.tier}</div>
                  </div>
                  <div className="surface-2 p-4">
                    <div className="text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--text-3)] font-semibold">Sede</div>
                    <div className="font-display text-[22px] font-bold mt-1">{selected.sede}</div>
                  </div>
                </div>
              </Card>

              {selected.id && <BrazilListDetail key={selected.id} listId={selected.id} onChanged={load}/>}
            </div>
          ) : (
            <Card className="p-16 text-center">
              <div className="w-14 h-14 rounded-[14px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)' }}>
                <I.Layers size={22} style={{ color: 'var(--text-3)' }}/>
              </div>
              <div className="font-display text-[16px] font-semibold mt-3">Selecione uma lista</div>
              <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">Escolha uma das {lists.length} listas ao lado para gerenciar.</div>
            </Card>
          )}
        </div>
      </div>

      {editModalOpen && selected?.id && (
        <EditListModal
          list={selected}
          onClose={() => setEditModalOpen(false)}
          onSaved={() => { setEditModalOpen(false); void load(); }}
        />
      )}
    </Page>
  );
}

// ─── Modal de edição da lista ─────────────────────────────────────────

function EditListModal({
  list,
  onClose,
  onSaved,
}: {
  list: ListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(list.name);
  const [format, setFormat] = React.useState<'TOP_10' | 'TOP_20'>(list.format ?? (list.tier === 'TOP 10' ? 'TOP_10' : 'TOP_20'));
  const [hometown, setHometown] = React.useState(list.hometown ?? '');
  const [administratorName, setAdministratorName] = React.useState(list.administratorName ?? '');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const submit = async () => {
    if (!list.id) return;
    if (!name.trim()) { push({ title: 'Informe o nome da lista', tone: 'rose' }); return; }
    setBusy(true);
    try {
      await api.patch(ENDPOINTS.BRAZIL_LISTS.update(list.id), {
        name: name.trim(),
        format,
        hometown: hometown.trim() || null,
        administratorName: administratorName.trim() || null,
      });
      push({ title: 'Lista atualizada', tone: 'emerald' });
      onSaved();
    } catch (e) {
      push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
      <div className="surface-elev p-6 w-full max-w-lg">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <I.Edit size={18}/>
          </div>
          <div>
            <div className="font-display text-[18px] font-bold">Editar lista</div>
            <div className="text-[12px] text-[color:var(--text-3)]">DDD {list.ddd} · não dá pra trocar o DDD aqui (criar uma nova se precisar).</div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nome *</label>
            <input className="input mt-1" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lista Área 45"/>
          </div>

          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Formato</label>
            <select className="input mt-1" value={format} onChange={(e) => setFormat(e.target.value as 'TOP_10' | 'TOP_20')}>
              <option value="TOP_20">TOP 20</option>
              <option value="TOP_10">TOP 10</option>
            </select>
            {list.pilots > (format === 'TOP_10' ? 10 : 20) && (
              <p className="text-[11px] mt-1" style={{ color: '#ff7585' }}>
                ⚠ A lista tem {list.pilots} pilotos e não cabe em {format === 'TOP_10' ? 'TOP 10' : 'TOP 20'}. Remova pilotos antes.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Cidade sede</label>
              <input className="input mt-1" value={hometown} onChange={(e) => setHometown(e.target.value)} placeholder="—"/>
            </div>
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Administrador</label>
              <input className="input mt-1" value={administratorName} onChange={(e) => setAdministratorName(e.target.value)} placeholder="—"/>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Salvando…</> : <><I.Check size={14}/> Salvar</>}
          </button>
        </div>
      </div>
    </div>
  );
}
