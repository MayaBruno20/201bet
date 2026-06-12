'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Page, Card, StatusChip, Money } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm } from '@admin/components/ui/confirm';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';
import { getPublicSiteUrl } from '@/lib/env-public';

type Campaign = {
  id: string;
  name: string;
  code: string;
  bonusAmount: string | number;
  minDeposit: string | number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  enrolledCount: number;
  grantedCount: number;
  totalPaidOut: number;
};

type Enrollment = {
  id: string;
  bonusStatus: 'PENDING' | 'GRANTED';
  bonusAmount: string | number | null;
  enrolledAt: string;
  bonusGrantedAt: string | null;
  user: { id: string; name: string; email: string; createdAt: string };
};

const emptyForm = { name: '', code: '', bonusAmount: 5, minDeposit: 20, active: true };

export default function PromocoesPage() {
  const [list, setList] = React.useState<Campaign[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const [editing, setEditing] = React.useState<Campaign | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);

  const [linkCampaign, setLinkCampaign] = React.useState<Campaign | null>(null);
  const [linkBase, setLinkBase] = React.useState('');

  const [enrollCampaign, setEnrollCampaign] = React.useState<Campaign | null>(null);
  const [enrollments, setEnrollments] = React.useState<Enrollment[]>([]);
  const [enrollLoading, setEnrollLoading] = React.useState(false);

  const { push } = useToast();
  const confirm = useConfirm();

  React.useEffect(() => { setLinkBase(getPublicSiteUrl()); }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setList(await api.get<Campaign[]>(ENDPOINTS.PROMOTIONS.list)); }
    catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setLoading(false); }
  }, [push]);
  React.useEffect(() => { void load(); }, [load]);

  const startCreate = () => { setEditing(null); setForm(emptyForm); setCreateOpen(true); };
  const startEdit = (c: Campaign) => {
    setEditing(c);
    setForm({ name: c.name, code: c.code, bonusAmount: Number(c.bonusAmount), minDeposit: Number(c.minDeposit), active: c.active });
    setCreateOpen(false);
  };

  const submit = async () => {
    if (!form.name.trim()) { push({ title: 'Nome obrigatório', tone: 'rose' }); return; }
    if (Number(form.bonusAmount) <= 0) { push({ title: 'Bônus deve ser maior que zero', tone: 'rose' }); return; }
    if (Number(form.minDeposit) < 0) { push({ title: 'Depósito mínimo inválido', tone: 'rose' }); return; }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        bonusAmount: Number(form.bonusAmount),
        minDeposit: Number(form.minDeposit),
        active: form.active,
      };
      if (editing) {
        await api.patch(ENDPOINTS.PROMOTIONS.update(editing.id), payload);
        push({ title: 'Campanha atualizada', tone: 'emerald' });
      } else {
        await api.post(ENDPOINTS.PROMOTIONS.create, payload);
        push({ title: 'Campanha criada', tone: 'emerald' });
      }
      setEditing(null); setCreateOpen(false); setForm(emptyForm);
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  const toggle = async (c: Campaign) => {
    try {
      await api.patch(ENDPOINTS.PROMOTIONS.update(c.id), { active: !c.active });
      push({ title: c.active ? 'Campanha desativada' : 'Campanha ativada', tone: c.active ? 'amber' : 'emerald' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  };

  const remove = async (c: Campaign) => {
    const ok = await confirm({
      title: 'Desativar campanha?',
      body: <>A campanha <em>{c.name}</em> deixa de inscrever novos usuários. Quem já se inscreveu mantém o bônus pendente/concedido.</>,
      tone: 'danger',
      confirmLabel: 'Desativar',
      icon: 'Pause',
    });
    if (!ok) return;
    try {
      await api.del(ENDPOINTS.PROMOTIONS.delete(c.id));
      push({ title: 'Campanha desativada', tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  };

  const openEnrollments = async (c: Campaign) => {
    setEnrollCampaign(c); setEnrollments([]); setEnrollLoading(true);
    try { setEnrollments(await api.get<Enrollment[]>(ENDPOINTS.PROMOTIONS.enrollments(c.id))); }
    catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setEnrollLoading(false); }
  };

  const promoLink = (code: string) => `${(linkBase || '').replace(/\/+$/, '')}/login?promo=${encodeURIComponent(code)}`;
  const qrSrc = (link: string) => `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(link)}`;

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); push({ title: 'Copiado!', tone: 'emerald' }); }
    catch { push({ title: 'Não foi possível copiar', tone: 'rose' }); }
  };

  const showForm = createOpen || editing;

  return (
    <Page eyebrow="Financeiro" title="Promoções"
      sub="Campanhas de bônus por QR Code (panfleto). Novos usuários cadastrados pelo link ganham saldo bônus no 1º depósito que atingir o mínimo."
      actions={<>
        <button className="btn btn-ghost focusable" onClick={load}><I.Activity size={15}/> Atualizar</button>
        <button className="btn btn-primary focusable" onClick={startCreate}><I.Plus size={15}/> Nova campanha</button>
      </>}>

      {loading && <Card className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</Card>}
      {!loading && list.length === 0 && (
        <Card className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Nenhuma campanha. Crie a primeira para gerar o link/QR do panfleto.</Card>
      )}

      <div className="space-y-3">
        {list.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-[10px] grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <I.Dollar size={16}/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className="font-display text-[15px] font-bold">{c.name}</span>
                  <span className="chip font-mono" style={{ background: 'var(--surface-3)', color: 'var(--text-2)' }}>{c.code}</span>
                  <StatusChip status={c.active ? 'Ativa' : 'Inativa'}/>
                </div>
                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[12px] text-[color:var(--text-3)]">
                  <span>Bônus <strong className="text-[color:var(--text-1)]"><Money value={Number(c.bonusAmount)}/></strong></span>
                  <span>Mín. depósito <strong className="text-[color:var(--text-1)]"><Money value={Number(c.minDeposit)}/></strong></span>
                  <span>Inscritos <strong className="text-[color:var(--text-1)]">{c.enrolledCount}</strong></span>
                  <span>Bônus pagos <strong className="text-[color:var(--text-1)]">{c.grantedCount}</strong></span>
                  <span>Total pago <strong className="text-[color:var(--text-1)]"><Money value={c.totalPaidOut}/></strong></span>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button className="btn-icon" onClick={() => setLinkCampaign(c)} title="Link & QR Code"><I.Globe size={15}/></button>
                <button className="btn-icon" onClick={() => openEnrollments(c)} title="Inscritos"><I.Users size={15}/></button>
                <button className="btn-icon" onClick={() => startEdit(c)} title="Editar"><I.Edit size={15}/></button>
                <button className="btn-icon" onClick={() => (c.active ? remove(c) : toggle(c))} title={c.active ? 'Desativar' : 'Ativar'}>
                  {c.active ? <I.Pause size={15}/> : <I.Play size={15}/>}
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Modal: criar/editar campanha ── */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
          <div className="surface-elev p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><I.Dollar size={18}/></div>
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">{editing ? 'Editar campanha' : 'Nova campanha'}</div>
                <div className="text-[12px] text-[color:var(--text-3)]">Bônus de saldo para novos usuários via QR do panfleto.</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nome *</label>
                <input className="input mt-1" value={form.name} placeholder="Ex.: Panfleto Armageddon 15ª Edição" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}/>
              </div>
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Código do link {editing ? '' : '(opcional — gerado do nome)'}</label>
                <input className="input mt-1 font-mono" value={form.code} placeholder="panfleto-armageddon" onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}/>
                <div className="text-[11px] text-[color:var(--text-4)] mt-1">Vira <span className="font-mono">/login?promo={(form.code.trim() || '…').toLowerCase()}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Saldo bônus (R$) *</label>
                  <input className="input mt-1" type="number" min={0} step="0.01" value={form.bonusAmount} onChange={(e) => setForm((f) => ({ ...f, bonusAmount: Number(e.target.value) }))}/>
                </div>
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Depósito mínimo (R$) *</label>
                  <input className="input mt-1" type="number" min={0} step="0.01" value={form.minDeposit} onChange={(e) => setForm((f) => ({ ...f, minDeposit: Number(e.target.value) }))}/>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer select-none">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}/>
                Campanha ativa (aceitando novos inscritos)
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button className="btn btn-ghost focusable" onClick={() => { setEditing(null); setCreateOpen(false); setForm(emptyForm); }} disabled={busy}>Cancelar</button>
              <button className="btn btn-primary focusable" onClick={submit} disabled={busy}>{busy ? 'Salvando…' : (editing ? 'Salvar' : 'Criar campanha')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: link & QR ── */}
      {linkCampaign && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4" onClick={() => setLinkCampaign(null)}>
          <div className="surface-elev p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><I.Globe size={18}/></div>
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">Link & QR Code</div>
                <div className="text-[12px] text-[color:var(--text-3)]">{linkCampaign.name}</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Base do site público</label>
                <input className="input mt-1 font-mono text-[12px]" value={linkBase} onChange={(e) => setLinkBase(e.target.value)} placeholder="https://palpite201.com"/>
                <div className="text-[11px] text-[color:var(--text-4)] mt-1">Ajuste se o domínio do site for diferente. O QR e o link usam essa base.</div>
              </div>

              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Link promocional</label>
                <div className="flex gap-2 mt-1">
                  <input className="input font-mono text-[12px]" readOnly value={promoLink(linkCampaign.code)} onFocus={(e) => e.currentTarget.select()}/>
                  <button className="btn btn-ghost focusable shrink-0" onClick={() => copy(promoLink(linkCampaign.code))}><I.Check size={14}/> Copiar</button>
                </div>
              </div>

              <div className="grid place-items-center pt-1">
                {linkBase ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrSrc(promoLink(linkCampaign.code))} alt="QR Code da campanha" width={240} height={240} className="rounded-xl bg-white p-2"/>
                ) : (
                  <div className="text-[12px] text-[color:var(--text-3)] py-8">Defina a base do site para gerar o QR.</div>
                )}
                <div className="text-[11px] text-[color:var(--text-4)] mt-2 text-center">Aponte a câmera para testar. Imprima no panfleto.</div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <a className="btn btn-ghost focusable" href={qrSrc(promoLink(linkCampaign.code))} target="_blank" rel="noreferrer"><I.Download size={14}/> Baixar QR</a>
              <button className="btn btn-primary focusable" onClick={() => setLinkCampaign(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: inscritos ── */}
      {enrollCampaign && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4" onClick={() => setEnrollCampaign(null)}>
          <div className="surface-elev p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}><I.Users size={18}/></div>
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">Inscritos via QR</div>
                <div className="text-[12px] text-[color:var(--text-3)]">{enrollCampaign.name} · {enrollCampaign.enrolledCount} inscritos · {enrollCampaign.grantedCount} bônus pagos</div>
              </div>
            </div>

            {enrollLoading && <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</div>}
            {!enrollLoading && enrollments.length === 0 && <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Ninguém se cadastrou por essa campanha ainda.</div>}

            {!enrollLoading && enrollments.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-[0.12em] text-[color:var(--text-4)]">
                      <th className="py-2 pr-3 font-semibold">Usuário</th>
                      <th className="py-2 pr-3 font-semibold">Inscrito em</th>
                      <th className="py-2 pr-3 font-semibold">Bônus</th>
                      <th className="py-2 font-semibold">Concedido em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((en) => (
                      <tr key={en.id} className="border-t border-[color:var(--border)]">
                        <td className="py-2.5 pr-3">
                          <div className="font-medium text-[color:var(--text-1)]">{en.user.name}</div>
                          <div className="text-[11px] text-[color:var(--text-4)]">{en.user.email}</div>
                        </td>
                        <td className="py-2.5 pr-3 text-[color:var(--text-3)] whitespace-nowrap">{new Date(en.enrolledAt).toLocaleDateString('pt-BR')}</td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <StatusChip status={en.bonusStatus === 'GRANTED' ? 'Concedido' : 'Pendente'}/>
                            {en.bonusAmount != null && <span className="font-mono text-[color:var(--text-2)]"><Money value={Number(en.bonusAmount)}/></span>}
                          </div>
                        </td>
                        <td className="py-2.5 text-[color:var(--text-3)] whitespace-nowrap">{en.bonusGrantedAt ? new Date(en.bonusGrantedAt).toLocaleDateString('pt-BR') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end mt-6">
              <button className="btn btn-primary focusable" onClick={() => setEnrollCampaign(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
