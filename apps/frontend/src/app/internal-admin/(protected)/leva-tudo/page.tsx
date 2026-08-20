'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Page, Card, StatusChip } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm } from '@admin/components/ui/confirm';
import { DatePicker } from '@admin/components/ui/datepicker';
import { api, apiUpload, getApiBaseUrl } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';
import { LevaTudoDetail } from '@admin/components/admin/leva-tudo-detail';

/** Resolve um caminho de imagem relativo (/api/images/:id) para URL absoluta. */
function resolveImg(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:')) return url;
  const base = getApiBaseUrl().replace(/\/api\/?$/, '');
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
}

function BannerField({ value, onChange, uploading, onUpload }: {
  value: string;
  onChange: (url: string) => void;
  uploading: boolean;
  onUpload: (file: File | null) => void;
}) {
  return (
    <div>
      <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Banner do evento</label>
      <div className="flex items-center gap-2 mt-1">
        <input className="input flex-1 min-w-0" value={value} placeholder="Cole uma URL ou envie um arquivo →" onChange={(e) => onChange(e.target.value)}/>
        <label className="btn btn-ghost focusable shrink-0" style={{ cursor: uploading ? 'default' : 'pointer' }}>
          {uploading ? <><span className="pulse-dot"/> Enviando…</> : <><I.Upload size={14}/> Enviar imagem</>}
          <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploading}
            onChange={(e) => { onUpload(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }}/>
        </label>
      </div>
      {value.trim() && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolveImg(value)} alt="" className="mt-2 h-20 w-full rounded-lg object-cover" onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}/>
      )}
    </div>
  );
}

type LevaTudoEvent = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  bannerUrl?: string | null;
  streamUrl?: string | null;
  featured?: boolean;
  scheduledAt: string;
  endsAt: string | null;
  notes?: string | null;
};

const EMPTY_FORM = { name: '', description: '', streamUrl: '', bannerUrl: '', featured: false, scheduledAt: '', endsAt: '', notes: '' };

export default function LevaTudoPage() {
  const [events, setEvents] = React.useState<LevaTudoEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<LevaTudoEvent | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editEvent, setEditEvent] = React.useState<LevaTudoEvent | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [form, setForm] = React.useState({ ...EMPTY_FORM });
  const { push } = useToast();
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.get<LevaTudoEvent[]>(ENDPOINTS.LEVA_TUDO.list);
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
      const created = await api.post<LevaTudoEvent>(ENDPOINTS.LEVA_TUDO.create, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        streamUrl: form.streamUrl.trim() || undefined,
        bannerUrl: form.bannerUrl.trim() || undefined,
        featured: form.featured,
        scheduledAt: form.scheduledAt,
        endsAt: form.endsAt || undefined,
        notes: form.notes.trim() || undefined,
      });
      push({ title: 'Leva Tudo criado', body: form.name, tone: 'emerald' });
      setForm({ ...EMPTY_FORM });
      setCreateOpen(false);
      await load();
      setSelected(created);
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  const toggleFeatured = async (e: LevaTudoEvent) => {
    try {
      await api.patch(ENDPOINTS.LEVA_TUDO.update(e.id), { featured: !e.featured });
      push({ title: !e.featured ? 'Destacado' : 'Destaque removido', body: e.name, tone: 'emerald' });
      await load();
      setSelected((s) => (s && s.id === e.id ? { ...s, featured: !e.featured } : s));
    } catch (err) { push({ title: 'Erro', body: err instanceof Error ? err.message : '', tone: 'rose' }); }
  };

  const saveEdit = async () => {
    if (!editEvent) return;
    if (!form.name.trim()) { push({ title: 'Nome é obrigatório', tone: 'rose' }); return; }
    setBusy(true);
    try {
      const updated = await api.patch<LevaTudoEvent>(ENDPOINTS.LEVA_TUDO.update(editEvent.id), {
        name: form.name.trim(),
        description: form.description.trim() || null,
        streamUrl: form.streamUrl.trim() || null,
        bannerUrl: form.bannerUrl.trim() || null,
        featured: form.featured,
        scheduledAt: form.scheduledAt || undefined,
        endsAt: form.endsAt || null,
        notes: form.notes.trim() || null,
      });
      push({ title: 'Evento atualizado', body: form.name, tone: 'emerald' });
      setEditEvent(null);
      await load();
      setSelected((s) => (s && s.id === editEvent.id ? { ...s, ...updated } : s));
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  const uploadBanner = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await apiUpload<{ id: string; url: string }>(ENDPOINTS.IMAGES.upload, file, 'file');
      setForm((f) => ({ ...f, bannerUrl: url }));
      push({ title: 'Banner enviado', tone: 'emerald' });
    } catch (e) { push({ title: 'Erro no upload', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setUploading(false); }
  };

  const openEdit = (e: LevaTudoEvent) => {
    setForm({
      name: e.name ?? '',
      description: e.description ?? '',
      streamUrl: e.streamUrl ?? '',
      bannerUrl: e.bannerUrl ?? '',
      featured: !!e.featured,
      scheduledAt: e.scheduledAt ?? '',
      endsAt: e.endsAt ?? '',
      notes: e.notes ?? '',
    });
    setEditEvent(e);
  };

  const cancelEvent = async (e: LevaTudoEvent) => {
    const ok = await confirm({
      title: 'Cancelar Leva Tudo?',
      body: <>Vai cancelar <strong>{e.name}</strong>. Inscritos e mercados em aberto serão afetados.</>,
      tone: 'danger',
      confirmLabel: 'Cancelar evento',
      icon: 'Trash',
    });
    if (!ok) return;
    try {
      await api.del(ENDPOINTS.LEVA_TUDO.delete(e.id));
      push({ title: 'Cancelado', body: e.name, tone: 'amber' });
      setSelected(null);
      await load();
    } catch (err) { push({ title: 'Erro', body: err instanceof Error ? err.message : '', tone: 'rose' }); }
  };

  const statusLabel = (s: string) => s === 'IN_PROGRESS' ? 'AO VIVO' : s === 'FINISHED' ? 'ENCERRADO' : s === 'CANCELED' ? 'CANCELADO' : 'AGENDADO';

  return (
    <Page eyebrow="Operação · Eventos" title="Leva Tudo"
      sub="2 chaves (A–B) de 32 pilotos → Final: Grande Final + disputa de 3º lugar."
      actions={<>
        <button className="btn btn-ghost focusable" onClick={load}><I.Activity size={15}/> Atualizar</button>
        <button className="btn btn-primary focusable" onClick={() => { setForm({ ...EMPTY_FORM }); setCreateOpen(true); }}>
          <I.Plus size={15}/> Novo Leva Tudo
        </button>
      </>}>
      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-12 lg:col-span-4">
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="text-[12px] font-semibold">Eventos <span className="text-[color:var(--text-3)]">({events.length})</span></div>
            </div>
            {loading && <div className="p-6 text-center text-[12.5px] text-[color:var(--text-3)]">Carregando…</div>}
            {!loading && events.length === 0 && <div className="p-6 text-center text-[12.5px] text-[color:var(--text-3)]">Nenhum Leva Tudo ainda.</div>}
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
                    <StatusChip status={statusLabel(e.status)}/>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-8">
          {selected ? (
            <div className="space-y-5">
              <Card className="p-4 sm:p-5">
                <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-1">Leva Tudo</div>
                <div className="flex items-end justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-display text-[24px] font-bold">{selected.name}</div>
                    <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">
                      {new Date(selected.scheduledAt).toLocaleString('pt-BR')}
                      {selected.endsAt && ` — ${new Date(selected.endsAt).toLocaleString('pt-BR')}`}
                    </div>
                    {selected.description && <div className="text-[12px] text-[color:var(--text-2)] mt-2">{selected.description}</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selected.featured && (
                      <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>★ Destaque</span>
                    )}
                    <StatusChip status={statusLabel(selected.status)}/>
                    {selected.status !== 'CANCELED' && (
                      <>
                        <button className="btn btn-ghost focusable" onClick={() => toggleFeatured(selected)} style={{ color: selected.featured ? 'var(--accent)' : undefined }}>
                          <I.Star size={14}/> {selected.featured ? 'Remover destaque' : 'Destacar'}
                        </button>
                        <button className="btn btn-ghost focusable" onClick={() => openEdit(selected)}>
                          <I.Edit size={14}/> Editar
                        </button>
                        <button className="btn btn-ghost focusable" onClick={() => cancelEvent(selected)} style={{ color: '#ff7585' }}>
                          <I.Trash size={14}/> Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {selected.bannerUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveImg(selected.bannerUrl)} alt="" className="mt-4 h-32 w-full rounded-xl object-cover" onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }}/>
                )}
              </Card>

              <LevaTudoDetail key={selected.id} eventId={selected.id} onChanged={load}/>
            </div>
          ) : (
            <Card className="p-8 sm:p-16 text-center">
              <div className="w-14 h-14 rounded-[14px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)' }}>
                <I.Trophy size={22} style={{ color: 'var(--text-3)' }}/>
              </div>
              <div className="font-display text-[16px] font-semibold mt-3">Selecione um Leva Tudo</div>
              <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">Ou clique em "Novo Leva Tudo".</div>
            </Card>
          )}
        </div>
      </div>

      {(createOpen || editEvent) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
          <div className="surface-elev p-4 sm:p-6 w-full max-w-lg max-h-[90dvh] overflow-y-auto">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                {editEvent ? <I.Edit size={18}/> : <I.Trophy size={18}/>}
              </div>
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">{editEvent ? 'Editar Leva Tudo' : 'Novo Leva Tudo'}</div>
                <div className="text-[12px] text-[color:var(--text-3)]">2 chaves de 32 → Grande Final + disputa de 3º lugar.</div>
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
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Link da transmissão (YouTube)</label>
                <input className="input mt-1" value={form.streamUrl} placeholder="https://youtube.com/watch?v=… ou /live/…" onChange={(e) => setForm((f) => ({ ...f, streamUrl: e.target.value }))}/>
              </div>
              <BannerField value={form.bannerUrl} onChange={(url) => setForm((f) => ({ ...f, bannerUrl: url }))} uploading={uploading} onUpload={uploadBanner}/>
              <label className="flex items-center gap-2 text-[12.5px]">
                <input type="checkbox" checked={form.featured} onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}/>
                Destacar o evento (featured)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Início *</label>
                  <div className="mt-1"><DatePicker value={form.scheduledAt} onChange={(v) => setForm((f) => ({ ...f, scheduledAt: v }))} placeholder="Data e hora"/></div>
                </div>
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Fim</label>
                  <div className="mt-1"><DatePicker value={form.endsAt} onChange={(v) => setForm((f) => ({ ...f, endsAt: v }))} placeholder="Opcional"/></div>
                </div>
              </div>
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Notas internas</label>
                <textarea className="input mt-1" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}/>
              </div>
            </div>

            <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost flex-1 justify-center" onClick={() => { setCreateOpen(false); setEditEvent(null); }} disabled={busy}>Cancelar</button>
              <button className="btn btn-primary flex-1 justify-center" onClick={editEvent ? saveEdit : create} disabled={busy}>
                {busy ? <><span className="pulse-dot"/> {editEvent ? 'Salvando…' : 'Criando…'}</> : <><I.Check size={14}/> {editEvent ? 'Salvar' : 'Criar'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
