'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Page, Card, StatusChip, Avatar } from '@admin/components/ui/primitives';
import { fetchPilots, type Pilot } from '@admin/lib/data';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm, usePrompt } from '@admin/components/ui/confirm';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';

export default function PilotosPage() {
  const [pilots, setPilots] = React.useState<Pilot[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'active' | 'inactive'>('all');
  const [audience, setAudience] = React.useState<'all' | 'official' | 'guest'>('official');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', nickname: '', team: '', carNumber: '' });
  const { push } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setPilots(await fetchPilots()); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const officialCount = pilots.filter((p) => !p.isGuest).length;
  const guestCount = pilots.filter((p) => p.isGuest).length;

  const filtered = pilots.filter((p) => {
    if (audience === 'official' && p.isGuest) return false;
    if (audience === 'guest' && !p.isGuest) return false;
    if (filter === 'active' && p.status !== 'Ativo') return false;
    if (filter === 'inactive' && p.status !== 'Inativo') return false;
    if (q && !(p.name + p.tag + p.region).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const create = async () => {
    if (!form.name.trim()) { push({ title: 'Informe o nome', tone: 'rose' }); return; }
    setBusy(true);
    try {
      await api.post(ENDPOINTS.DRIVERS.create, {
        name: form.name.trim(),
        nickname: form.nickname.trim() || undefined,
        team: form.team.trim() || undefined,
        carNumber: form.carNumber.trim() || undefined,
      });
      push({ title: 'Piloto cadastrado', body: form.name, tone: 'emerald' });
      setForm({ name: '', nickname: '', team: '', carNumber: '' });
      setCreateOpen(false);
      await load();
    } catch (e) {
      push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' });
    } finally { setBusy(false); }
  };

  const editName = async (p: Pilot) => {
    if (!p.realId) return;
    const novo = await prompt({
      title: 'Editar nome do piloto',
      inputLabel: 'Novo nome',
      initialValue: p.name,
      tone: 'info',
      icon: 'Edit',
      confirmLabel: 'Salvar',
      validate: (v) => v.length >= 2 ? null : 'Mínimo 2 caracteres',
    });
    if (!novo || novo === p.name) return;
    try {
      await api.patch(ENDPOINTS.DRIVERS.update(p.realId), { name: novo });
      push({ title: 'Nome atualizado', body: novo, tone: 'emerald' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  };

  const deactivate = async (p: Pilot) => {
    const ok = await confirm({
      title: 'Desativar piloto?',
      body: <><strong>{p.name}</strong> não vai mais aparecer em rosters/embates.</>,
      tone: 'warning',
      confirmLabel: 'Desativar',
      icon: 'Trash',
    });
    if (!ok) return;
    if (!p.realId) return;
    try {
      await api.del(ENDPOINTS.DRIVERS.delete(p.realId));
      push({ title: 'Piloto desativado', body: p.name, tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  };

  return (
    <Page eyebrow="Cadastros" title="Pilotos" sub="Cadastro, edição e desativação de pilotos."
      actions={<>
        <button className="btn btn-ghost focusable" onClick={load}><I.Activity size={15}/> Atualizar</button>
        <button className="btn btn-primary focusable" onClick={() => setCreateOpen(true)}>
          <I.Plus size={15}/> Novo piloto
        </button>
      </>}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Cadastrados', value: officialCount, tone: '#7cd0ff', sub: 'Pilotos oficiais' },
          { label: 'Convidados', value: guestCount, tone: 'var(--accent)', sub: 'One-off / embate rápido' },
          { label: 'Ativos', value: pilots.filter((p) => p.status === 'Ativo').length, tone: '#3ee093', sub: '' },
          { label: 'Inativos', value: pilots.filter((p) => p.status === 'Inativo').length, tone: 'var(--text-3)', sub: '' },
        ].map((m) => (
          <Card key={m.label} className="p-4">
            <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">{m.label}</div>
            <div className="font-display text-[24px] font-bold mt-1 tabular-nums" style={{ color: m.tone }}>{m.value}</div>
            {m.sub && <div className="text-[10.5px] text-[color:var(--text-4)] mt-0.5">{m.sub}</div>}
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-1 surface-2 rounded-[12px] p-1 mb-5 w-fit max-w-full overflow-x-auto no-scrollbar">
        {[
          { id: 'official' as const, label: 'Oficiais', count: officialCount },
          { id: 'guest' as const, label: 'Convidados', count: guestCount },
          { id: 'all' as const, label: 'Todos', count: pilots.length },
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => setAudience(opt.id)}
            className="px-3 py-1.5 text-[12.5px] font-semibold rounded-[8px] flex items-center gap-1.5 whitespace-nowrap"
            style={{
              background: audience === opt.id ? 'var(--surface-3)' : 'transparent',
              color: audience === opt.id ? (opt.id === 'guest' ? 'var(--accent)' : 'var(--text)') : 'var(--text-3)',
            }}
          >
            {opt.label} <span className="text-[10.5px] tabular-nums" style={{ opacity: 0.7 }}>({opt.count})</span>
          </button>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center gap-3 p-4 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1 relative min-w-[260px]">
            <I.Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-3)' }}/>
            <input className="input pl-9" placeholder="Buscar nome, número, equipe…" value={q} onChange={(e) => setQ(e.target.value)}/>
          </div>
          <div className="flex items-center gap-1 surface-2 rounded-[12px] p-1 max-w-full overflow-x-auto no-scrollbar">
            {[{ id: 'all' as const, label: 'Todos' }, { id: 'active' as const, label: 'Ativos' }, { id: 'inactive' as const, label: 'Inativos' }].map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className="px-3 py-1.5 text-[12.5px] font-semibold rounded-[8px] whitespace-nowrap"
                style={{ background: filter === f.id ? 'var(--surface-3)' : 'transparent', color: filter === f.id ? 'var(--text)' : 'var(--text-3)' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Carregando pilotos…</div>}
        {!loading && filtered.length === 0 && <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Nenhum piloto encontrado.</div>}

        {!loading && filtered.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 20 }}>Piloto</th>
                  <th className="hidden md:table-cell">Número</th><th>Equipe</th>
                  <th>Status</th>
                  <th style={{ paddingRight: 20 }}/>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.id} style={{ background: p.isGuest ? 'rgba(255, 176, 40, 0.04)' : undefined }}>
                    <td style={{ paddingLeft: 20 }}>
                      <div className="flex items-center gap-3">
                        <Avatar initials={p.avatar} size={34} tone={p.isGuest ? 'amber' : ['amber','sky','violet','emerald','rose'][i % 5]}/>
                        <div>
                          <div className="font-semibold text-[13.5px] flex items-center gap-2">
                            {p.name}
                            {p.isGuest && (
                              <span className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 9 }}>
                                CONVIDADO
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[color:var(--text-3)] font-mono">{p.tag}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell text-[color:var(--text-2)] font-mono text-[12px]">{p.tag}</td>
                    <td className="text-[color:var(--text-2)] text-[12px]">{p.region}</td>
                    <td><StatusChip status={p.status}/></td>
                    <td className="text-right" style={{ paddingRight: 20 }}>
                      <div className="flex justify-end gap-1">
                        <button className="btn-icon focusable" title="Editar nome" onClick={() => editName(p)}><I.Edit size={15}/></button>
                        {p.status === 'Ativo' && (
                          <button className="btn-icon focusable" title="Desativar" onClick={() => deactivate(p)} style={{ color: '#ff7585' }}>
                            <I.Trash size={15}/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Modal Criar Piloto ── */}
      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
          <div className="surface-elev p-5 sm:p-6 w-full max-w-md">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <I.Plus size={18}/>
              </div>
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">Novo piloto</div>
                <div className="text-[12px] text-[color:var(--text-3)]">Cadastre um piloto para usar em eventos.</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nome completo *</label>
                <input className="input mt-1" autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Apelido</label>
                  <input className="input mt-1" value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}/>
                </div>
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nº do carro</label>
                  <input className="input mt-1" value={form.carNumber} onChange={(e) => setForm((f) => ({ ...f, carNumber: e.target.value }))}/>
                </div>
              </div>
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Equipe / preparador</label>
                <input className="input mt-1" value={form.team} onChange={(e) => setForm((f) => ({ ...f, team: e.target.value }))}/>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button className="btn btn-ghost flex-1 justify-center" onClick={() => setCreateOpen(false)} disabled={busy}>Cancelar</button>
              <button className="btn btn-primary flex-1 justify-center" onClick={create} disabled={busy || !form.name.trim()}>
                {busy ? <><span className="pulse-dot"/> Criando…</> : <><I.Check size={14}/> Cadastrar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
