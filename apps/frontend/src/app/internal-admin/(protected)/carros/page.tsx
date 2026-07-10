'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Page, Card, StatusChip } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm, usePrompt } from '@admin/components/ui/confirm';
import { api, apiUpload, getApiBaseUrl } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';

type BackendCar = {
  id: string;
  driverId: string;
  name: string;
  category: string;
  number?: string | null;
  photoUrl?: string | null;
  active: boolean;
  driver: { id: string; name: string };
};

type BackendDriver = { id: string; name: string };

const PHOTO_BASE = (() => {
  const base = getApiBaseUrl();
  // /uploads/cars/foo.png é servido sob /api/uploads → mesma origem da API
  return base.replace(/\/api\/?$/, '');
})();

function resolvePhoto(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${PHOTO_BASE}${url}`;
}

export default function CarrosPage() {
  const [cars, setCars] = React.useState<BackendCar[]>([]);
  const [drivers, setDrivers] = React.useState<BackendDriver[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<'all' | 'active' | 'inactive' | 'no-photo'>('all');
  const [q, setQ] = React.useState('');
  const [form, setForm] = React.useState({ driverId: '', name: '', category: '', number: '' });
  const { push } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [carList, driverList] = await Promise.all([
        api.get<BackendCar[]>(ENDPOINTS.CARS.list),
        api.get<BackendDriver[]>(ENDPOINTS.DRIVERS.list),
      ]);
      setCars(carList);
      setDrivers(driverList);
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setLoading(false); }
  }, [push]);
  React.useEffect(() => { void load(); }, [load]);

  const filtered = cars.filter((c) => {
    if (filter === 'active' && !c.active) return false;
    if (filter === 'inactive' && c.active) return false;
    if (filter === 'no-photo' && c.photoUrl) return false;
    if (q && !(c.name + c.driver.name + c.category + (c.number ?? '')).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const create = async () => {
    if (!form.driverId || !form.name.trim() || !form.category.trim()) {
      push({ title: 'Preencha piloto, nome e categoria', tone: 'rose' }); return;
    }
    setBusy('create');
    try {
      await api.post(ENDPOINTS.CARS.create, {
        driverId: form.driverId,
        name: form.name.trim(),
        category: form.category.trim(),
        number: form.number.trim() || undefined,
      });
      push({ title: 'Carro cadastrado', body: form.name, tone: 'emerald' });
      setForm({ driverId: '', name: '', category: '', number: '' });
      setCreateOpen(false);
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const editCategory = async (c: BackendCar) => {
    const novo = await prompt({
      title: 'Editar categoria',
      body: <>Carro: <strong>{c.name}</strong></>,
      inputLabel: 'Nova categoria',
      initialValue: c.category,
      placeholder: 'Ex: 9s, TUDOKIDÁ, 6s…',
      tone: 'info',
      icon: 'Edit',
      confirmLabel: 'Salvar',
      validate: (v) => v ? null : 'Categoria obrigatória',
    });
    if (!novo || novo === c.category) return;
    try {
      await api.patch(ENDPOINTS.CARS.update(c.id), { category: novo });
      push({ title: 'Categoria atualizada', tone: 'emerald' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  };

  const deactivate = async (c: BackendCar) => {
    const ok = await confirm({
      title: 'Desativar carro?',
      body: <>Vai desativar <strong>{c.name}</strong>. Embates futuros não vão mais usar este carro.</>,
      tone: 'warning',
      confirmLabel: 'Desativar',
      icon: 'Trash',
    });
    if (!ok) return;
    try {
      await api.del(ENDPOINTS.CARS.delete(c.id));
      push({ title: 'Carro desativado', tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  };

  const uploadPhoto = async (c: BackendCar, file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      push({ title: 'Imagem muito grande (máx. 20MB)', tone: 'rose' }); return;
    }
    setBusy(c.id);
    try {
      await apiUpload(ENDPOINTS.CARS.uploadPhoto(c.id), file, 'photo');
      push({ title: 'Foto enviada', body: c.name, tone: 'emerald' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const removePhoto = async (c: BackendCar) => {
    const ok = await confirm({
      title: 'Remover foto?',
      body: <>A foto de <strong>{c.name}</strong> será apagada do storage.</>,
      tone: 'warning',
      confirmLabel: 'Remover foto',
      icon: 'Trash',
    });
    if (!ok) return;
    try {
      await api.del(ENDPOINTS.CARS.deletePhoto(c.id));
      push({ title: 'Foto removida', tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  };

  return (
    <Page eyebrow="Cadastros" title="Carros"
      sub="Cadastre carros vinculados a pilotos e suba fotos pra exibir como fundo nas apostas."
      actions={<>
        <button className="btn btn-ghost focusable" onClick={load}><I.Activity size={15}/> Atualizar</button>
        <button className="btn btn-primary focusable" onClick={() => setCreateOpen(true)}>
          <I.Plus size={15}/> Novo carro
        </button>
      </>}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { l: 'Total', v: cars.length, tone: '#7cd0ff' },
          { l: 'Ativos', v: cars.filter((c) => c.active).length, tone: '#3ee093' },
          { l: 'Com foto', v: cars.filter((c) => !!c.photoUrl).length, tone: 'var(--accent)' },
          { l: 'Sem foto', v: cars.filter((c) => !c.photoUrl && c.active).length, tone: '#a78bfa' },
        ].map((m) => (
          <Card key={m.l} className="p-4">
            <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">{m.l}</div>
            <div className="font-display text-[24px] font-bold mt-1 tabular-nums" style={{ color: m.tone }}>{m.v}</div>
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center gap-3 p-4 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1 relative min-w-[260px]">
            <I.Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-3)' }}/>
            <input className="input pl-9" placeholder="Buscar carro, piloto, categoria, número…" value={q} onChange={(e) => setQ(e.target.value)}/>
          </div>
          <div className="flex items-center gap-1 surface-2 rounded-[12px] p-1 max-w-full overflow-x-auto no-scrollbar">
            {[
              { id: 'all' as const, label: 'Todos' },
              { id: 'active' as const, label: 'Ativos' },
              { id: 'inactive' as const, label: 'Inativos' },
              { id: 'no-photo' as const, label: 'Sem foto' },
            ].map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className="px-3 py-1.5 text-[12.5px] font-semibold rounded-[8px] whitespace-nowrap"
                style={{ background: filter === f.id ? 'var(--surface-3)' : 'transparent', color: filter === f.id ? 'var(--text)' : 'var(--text-3)' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</div>}
        {!loading && filtered.length === 0 && <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Nenhum carro encontrado.</div>}

        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {filtered.map((c) => {
              const photo = resolvePhoto(c.photoUrl);
              return (
                <div key={c.id} className="surface-2 overflow-hidden flex flex-col" style={{ borderRadius: 16 }}>
                  <div className="relative h-36 bg-[color:var(--surface-3)]">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={c.name} className="w-full h-full object-cover"/>
                    ) : (
                      <div className="w-full h-full grid place-items-center text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--text-4)] font-semibold">Sem foto</div>
                    )}
                    <div className="absolute top-2 right-2"><StatusChip status={c.active ? 'Ativo' : 'Inativo'}/></div>
                  </div>
                  <div className="p-3">
                    <div className="font-display text-[14px] font-bold truncate">{c.name}</div>
                    <div className="text-[11.5px] text-[color:var(--text-3)] truncate">
                      {c.driver.name}{c.number ? ` · #${c.number}` : ''} · <span className="text-[color:var(--text-2)]">{c.category}</span>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-3">
                      <label className="btn"
                        style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)', cursor: 'pointer' }}>
                        <I.Upload size={13}/> {photo ? 'Trocar' : 'Enviar'} foto
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                          disabled={busy === c.id}
                          onChange={(e) => {
                            const f = e.target.files?.[0]; e.target.value = '';
                            if (f) void uploadPhoto(c, f);
                          }}/>
                      </label>
                      {photo && (
                        <button className="btn" onClick={() => removePhoto(c)} disabled={busy === c.id}
                          style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                          <I.Trash size={13}/>
                        </button>
                      )}
                      <button className="btn btn-ghost" onClick={() => editCategory(c)} title="Editar categoria">
                        <I.Edit size={13}/>
                      </button>
                      {c.active && (
                        <button className="btn-icon focusable" onClick={() => deactivate(c)} title="Desativar" style={{ color: '#ff7585' }}>
                          <I.X size={14}/>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
          <div className="surface-elev p-5 sm:p-6 w-full max-w-md">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <I.Plus size={18}/>
              </div>
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">Novo carro</div>
                <div className="text-[12px] text-[color:var(--text-3)]">Vincule a um piloto cadastrado.</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Piloto *</label>
                <select className="input mt-1" value={form.driverId} onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}>
                  <option value="">Selecione…</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nome do carro *</label>
                <input className="input mt-1" placeholder="Opala Blower" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Categoria *</label>
                  <input className="input mt-1" placeholder="Ex: 9s, Original 10s, COPA_CATEGORIAS" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}/>
                </div>
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nº</label>
                  <input className="input mt-1" placeholder="123" value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}/>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button className="btn btn-ghost flex-1 justify-center" onClick={() => setCreateOpen(false)} disabled={!!busy}>Cancelar</button>
              <button className="btn btn-primary flex-1 justify-center" onClick={create} disabled={busy === 'create'}>
                {busy === 'create' ? <><span className="pulse-dot"/> Criando…</> : <><I.Check size={14}/> Cadastrar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
