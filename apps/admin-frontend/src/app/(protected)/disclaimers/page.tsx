'use client';

import * as React from 'react';
import { I } from '@/components/ui/icons';
import { Page, Card, StatusChip } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/lib/endpoints';

type Disclaimer = {
  id: string;
  message: string;
  active: boolean;
  variant: string;
  scrolling: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

const VARIANTS = ['amber', 'rose', 'emerald', 'sky', 'violet'] as const;
type Variant = typeof VARIANTS[number];

const VARIANT_TONE: Record<string, string> = {
  amber: 'var(--accent)',
  rose: '#ff7585',
  emerald: '#3ee093',
  sky: '#7cd0ff',
  violet: '#a78bfa',
};

export default function DisclaimersPage() {
  const [list, setList] = React.useState<Disclaimer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<Disclaimer | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [form, setForm] = React.useState({ message: '', variant: 'amber' as Variant, scrolling: false, priority: 0, active: true });
  const { push } = useToast();
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setList(await api.get<Disclaimer[]>(ENDPOINTS.DISCLAIMERS.list)); }
    catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setLoading(false); }
  }, [push]);
  React.useEffect(() => { void load(); }, [load]);

  const startEdit = (d: Disclaimer) => {
    setEditing(d);
    setForm({ message: d.message, variant: (d.variant as Variant) ?? 'amber', scrolling: d.scrolling, priority: d.priority, active: d.active });
  };

  const submit = async () => {
    if (!form.message.trim()) { push({ title: 'Mensagem obrigatória', tone: 'rose' }); return; }
    setBusy(true);
    try {
      if (editing) {
        await api.patch(ENDPOINTS.DISCLAIMERS.update(editing.id), form);
        push({ title: 'Disclaimer atualizado', tone: 'emerald' });
      } else {
        await api.post(ENDPOINTS.DISCLAIMERS.create, form);
        push({ title: 'Disclaimer criado', tone: 'emerald' });
      }
      setEditing(null); setCreateOpen(false);
      setForm({ message: '', variant: 'amber', scrolling: false, priority: 0, active: true });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  const toggle = async (d: Disclaimer) => {
    try {
      await api.patch(ENDPOINTS.DISCLAIMERS.update(d.id), { active: !d.active });
      push({ title: d.active ? 'Disclaimer desativado' : 'Disclaimer ativado', tone: d.active ? 'amber' : 'emerald' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  };

  const remove = async (d: Disclaimer) => {
    const ok = await confirm({
      title: 'Excluir disclaimer?',
      body: <>Vai apagar permanentemente: <em>“{d.message.slice(0, 80)}{d.message.length > 80 ? '…' : ''}”</em></>,
      tone: 'danger',
      confirmLabel: 'Excluir',
      icon: 'Trash',
    });
    if (!ok) return;
    try {
      await api.del(ENDPOINTS.DISCLAIMERS.delete(d.id));
      push({ title: 'Excluído', tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  };

  const showForm = createOpen || editing;

  return (
    <Page eyebrow="Sistema" title="Disclaimers"
      sub="Avisos no topo do site público (201-bet.com). Ativos aparecem em ordem de prioridade."
      actions={<>
        <button className="btn btn-ghost focusable" onClick={load}><I.Activity size={15}/> Atualizar</button>
        <button className="btn btn-primary focusable" onClick={() => { setCreateOpen(true); setEditing(null); setForm({ message: '', variant: 'amber', scrolling: false, priority: 0, active: true }); }}>
          <I.Plus size={15}/> Novo disclaimer
        </button>
      </>}>
      {loading && <Card className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</Card>}
      {!loading && list.length === 0 && <Card className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Nenhum disclaimer cadastrado.</Card>}

      <div className="space-y-3">
        {list.map((d) => (
          <Card key={d.id} className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-[10px] grid place-items-center shrink-0"
                style={{ background: VARIANT_TONE[d.variant] + '22', color: VARIANT_TONE[d.variant] }}>
                <I.AlertTriangle size={16}/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <StatusChip status={d.active ? 'Ativo' : 'Inativo'}/>
                  <span className="chip" style={{ background: VARIANT_TONE[d.variant] + '22', color: VARIANT_TONE[d.variant], textTransform: 'uppercase' }}>{d.variant}</span>
                  {d.scrolling && <span className="chip" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>marquee</span>}
                  <span className="text-[10.5px] text-[color:var(--text-4)] font-mono">prioridade {d.priority}</span>
                </div>
                <div className="text-[13px]">{d.message}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button className="btn-icon" onClick={() => toggle(d)} title={d.active ? 'Desativar' : 'Ativar'}>
                  {d.active ? <I.Pause size={15}/> : <I.Play size={15}/>}
                </button>
                <button className="btn-icon" onClick={() => startEdit(d)} title="Editar"><I.Edit size={15}/></button>
                <button className="btn-icon" onClick={() => remove(d)} title="Excluir" style={{ color: '#ff7585' }}><I.Trash size={15}/></button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
          <div className="surface-elev p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <I.AlertTriangle size={18}/>
              </div>
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">{editing ? 'Editar disclaimer' : 'Novo disclaimer'}</div>
                <div className="text-[12px] text-[color:var(--text-3)]">Aparece no topo do site público.</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Mensagem *</label>
                <textarea className="input mt-1" rows={3} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] block mb-1.5">Variante (cor)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIANTS.map((v) => (
                      <button key={v} type="button" onClick={() => setForm((f) => ({ ...f, variant: v }))}
                        className="rounded-[8px] px-2.5 py-1.5 text-[11px] font-bold uppercase"
                        style={{
                          background: form.variant === v ? VARIANT_TONE[v] + '33' : 'var(--surface-2)',
                          color: form.variant === v ? VARIANT_TONE[v] : 'var(--text-2)',
                          border: '1px solid ' + (form.variant === v ? VARIANT_TONE[v] : 'var(--border)'),
                        }}>{v}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Prioridade</label>
                  <input type="number" className="input mt-1" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))}/>
                  <p className="text-[10.5px] text-[color:var(--text-4)] mt-1">Maior = aparece primeiro</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                  <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}/>
                  Ativo (aparece no site)
                </label>
                <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                  <input type="checkbox" checked={form.scrolling} onChange={(e) => setForm((f) => ({ ...f, scrolling: e.target.checked }))}/>
                  Texto em marquee (rola horizontalmente)
                </label>
              </div>

              {/* Preview */}
              <div className="rounded-[10px] px-3 py-2 text-[12px] font-semibold"
                style={{ background: VARIANT_TONE[form.variant] + '22', color: VARIANT_TONE[form.variant], border: '1px solid ' + VARIANT_TONE[form.variant] + '55' }}>
                ⚠ {form.message || 'Preview da mensagem'}
              </div>
            </div>

            <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost flex-1 justify-center" onClick={() => { setCreateOpen(false); setEditing(null); }} disabled={busy}>Cancelar</button>
              <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy || !form.message.trim()}>
                {busy ? <><span className="pulse-dot"/> Salvando…</> : <><I.Check size={14}/> {editing ? 'Atualizar' : 'Criar'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
