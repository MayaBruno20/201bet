'use client';

import * as React from 'react';
import { I } from '@/components/ui/icons';
import { Page, Card, StatusChip, Avatar } from '@/components/ui/primitives';
import { fetchUsers, type Pilot } from '@/lib/data';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { DatePicker } from '@/components/ui/datepicker';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/lib/endpoints';

type Role = 'USER' | 'ADMIN' | 'OPERATOR' | 'AUDITOR';

const ROLE_TONE: Record<Role, string> = {
  ADMIN: 'var(--accent)',
  OPERATOR: '#7cd0ff',
  AUDITOR: '#a78bfa',
  USER: 'var(--text-3)',
};

export default function UsuariosPage() {
  const [users, setUsers] = React.useState<Pilot[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'active' | 'inactive' | 'staff'>('all');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [adjustUser, setAdjustUser] = React.useState<Pilot | null>(null);
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();
  const confirm = useConfirm();

  const [form, setForm] = React.useState({
    name: '', email: '', password: '', cpf: '', birthDate: '', role: 'OPERATOR' as Exclude<Role, 'USER'>,
  });

  const [adjust, setAdjust] = React.useState({ amount: '', operation: 'CREDIT' as 'CREDIT' | 'DEBIT', reason: '' });

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setUsers(await fetchUsers()); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void load(); }, [load]);

  const filtered = users.filter((u) => {
    if (filter === 'active' && u.status !== 'Ativo') return false;
    if (filter === 'inactive' && u.status !== 'Inativo') return false;
    if (filter === 'staff' && u.cat === 'USER') return false;
    if (q && !(u.name + u.tag + u.region).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const create = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      push({ title: 'Preencha nome, e-mail e senha', tone: 'rose' }); return;
    }
    if (form.password.length < 8) { push({ title: 'Senha mínima 8 caracteres', tone: 'rose' }); return; }
    const cpfDigits = form.cpf.replace(/\D/g, '');
    if (cpfDigits.length !== 11) { push({ title: 'CPF deve ter 11 dígitos', tone: 'rose' }); return; }
    if (!form.birthDate) { push({ title: 'Data de nascimento obrigatória', tone: 'rose' }); return; }

    setBusy(true);
    try {
      await api.post(ENDPOINTS.USERS.create, {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        cpf: cpfDigits,
        birthDate: form.birthDate,
        role: form.role,
      });
      push({ title: 'Conta criada', body: `${form.email} (${form.role})`, tone: 'emerald' });
      setForm({ name: '', email: '', password: '', cpf: '', birthDate: '', role: 'OPERATOR' });
      setCreateOpen(false);
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  const deactivate = async (u: Pilot) => {
    if (!u.realId) return;
    const ok = await confirm({
      title: 'Desativar conta?',
      body: <><strong>{u.tag}</strong> ({u.name}) perde acesso imediatamente. Apostas existentes ficam preservadas.</>,
      tone: 'danger',
      confirmLabel: 'Desativar conta',
      icon: 'Trash',
    });
    if (!ok) return;
    try {
      await api.del(ENDPOINTS.USERS.delete(u.realId));
      push({ title: 'Conta desativada', body: u.tag, tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
  };

  const submitAdjust = async () => {
    if (!adjustUser?.realId) return;
    const value = Number(adjust.amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) { push({ title: 'Informe um valor válido', tone: 'rose' }); return; }
    if (!adjust.reason.trim()) { push({ title: 'Informe o motivo do ajuste', tone: 'rose' }); return; }
    setBusy(true);
    try {
      await api.post(ENDPOINTS.USERS.walletAdjust(adjustUser.realId), {
        amount: value,
        operation: adjust.operation,
        reason: adjust.reason.trim(),
      });
      push({ title: 'Saldo ajustado', body: `${adjust.operation === 'CREDIT' ? '+' : '-'} R$ ${value.toFixed(2)}`, tone: adjust.operation === 'CREDIT' ? 'emerald' : 'amber' });
      setAdjustUser(null);
      setAdjust({ amount: '', operation: 'CREDIT', reason: '' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <Page eyebrow="Cadastros" title="Usuários"
      sub="Apostadores + equipe administrativa. Crie admins, ajuste saldo, desative contas."
      actions={<>
        <button className="btn btn-ghost focusable" onClick={load}><I.Activity size={15}/> Atualizar</button>
        <button className="btn btn-primary focusable" onClick={() => setCreateOpen(true)}>
          <I.Plus size={15}/> Nova conta
        </button>
      </>}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { l: 'Total', v: users.length },
          { l: 'Ativos', v: users.filter((u) => u.status === 'Ativo').length },
          { l: 'Equipe (admin)', v: users.filter((u) => u.cat !== 'USER').length },
          { l: 'Saldo total', v: 'R$ ' + users.reduce((s, u) => s + u.points, 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) },
        ].map((m) => (
          <Card key={m.l} className="p-4">
            <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">{m.l}</div>
            <div className="font-display text-[24px] font-bold mt-1">{m.v}</div>
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center gap-3 p-4 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1 relative min-w-[260px]">
            <I.Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-3)' }}/>
            <input className="input pl-9" placeholder="Buscar nome, e-mail, CPF…" value={q} onChange={(e) => setQ(e.target.value)}/>
          </div>
          <div className="flex items-center gap-1 surface-2 rounded-[12px] p-1">
            {[
              { id: 'all' as const, label: 'Todos' },
              { id: 'active' as const, label: 'Ativos' },
              { id: 'inactive' as const, label: 'Inativos' },
              { id: 'staff' as const, label: 'Equipe' },
            ].map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className="px-3 py-1.5 text-[12.5px] font-semibold rounded-[8px]"
                style={{ background: filter === f.id ? 'var(--surface-3)' : 'transparent', color: filter === f.id ? 'var(--text)' : 'var(--text-3)' }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</div>}
        {!loading && filtered.length === 0 && <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Nenhum usuário encontrado.</div>}

        {!loading && filtered.length > 0 && (
          <table>
            <thead>
              <tr>
                <th style={{ paddingLeft: 20 }}>Usuário</th>
                <th>E-mail</th>
                <th>Role</th>
                <th>Documento</th>
                <th className="text-right">Saldo</th>
                <th>Status</th>
                <th style={{ paddingRight: 20 }}/>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => {
                const role = (u.cat as Role) ?? 'USER';
                return (
                  <tr key={u.id}>
                    <td style={{ paddingLeft: 20 }}>
                      <div className="flex items-center gap-3">
                        <Avatar initials={u.avatar} size={34} tone={['amber','sky','violet','emerald','rose'][i % 5]}/>
                        <div className="font-semibold text-[13.5px]">{u.name}</div>
                      </div>
                    </td>
                    <td className="text-[color:var(--text-2)] text-[12px] font-mono truncate" style={{ maxWidth: 240 }}>{u.tag}</td>
                    <td>
                      <span className="chip" style={{ background: ROLE_TONE[role] + '22', color: ROLE_TONE[role], fontWeight: 700 }}>{role}</span>
                    </td>
                    <td className="text-[color:var(--text-2)] font-mono text-[11.5px]">{u.region}</td>
                    <td className="text-right tabular-nums font-semibold">R$ {u.points.toFixed(2)}</td>
                    <td><StatusChip status={u.status}/></td>
                    <td className="text-right" style={{ paddingRight: 20 }}>
                      <div className="flex justify-end gap-1">
                        <button className="btn-icon focusable" title="Ajustar saldo" onClick={() => setAdjustUser(u)} disabled={role !== 'USER'}>
                          <I.Wallet size={15}/>
                        </button>
                        {u.status === 'Ativo' && (
                          <button className="btn-icon focusable" title="Desativar" onClick={() => deactivate(u)} style={{ color: '#ff7585' }}>
                            <I.Trash size={15}/>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* ── Modal Criar Conta (admin/operator/auditor) ── */}
      {createOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
          <div className="surface-elev p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <I.Plus size={18}/>
              </div>
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">Nova conta administrativa</div>
                <div className="text-[12px] text-[color:var(--text-3)]">Crie ADMIN/OPERATOR/AUDITOR. Apostadores se cadastram pelo site público.</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Nome *</label>
                  <input className="input mt-1" autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}/>
                </div>
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">E-mail *</label>
                  <input className="input mt-1" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}/>
                </div>
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">CPF (11 dígitos) *</label>
                  <input className="input mt-1" value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} maxLength={14}/>
                </div>
                <div>
                  <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Data de nascimento *</label>
                  <div className="mt-1">
                    <DatePicker
                      value={form.birthDate}
                      withTime={false}
                      placeholder="DD/MM/AAAA"
                      onChange={(iso) => {
                        // Mantém só YYYY-MM-DD (sem timezone) para birthDate.
                        const dateOnly = iso ? iso.slice(0, 10) : '';
                        setForm((f) => ({ ...f, birthDate: dateOnly }));
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Senha temporária * <span className="text-[color:var(--text-4)]">(mín. 8)</span></label>
                <input className="input mt-1" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} minLength={8}/>
              </div>

              <div>
                <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] block mb-2">Permissão *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['ADMIN', 'OPERATOR', 'AUDITOR'] as const).map((r) => (
                    <button key={r} type="button" onClick={() => setForm((f) => ({ ...f, role: r }))}
                      className="rounded-[10px] px-3 py-2 text-[12.5px] font-bold"
                      style={{
                        background: form.role === r ? ROLE_TONE[r] + '22' : 'var(--surface-2)',
                        color: form.role === r ? ROLE_TONE[r] : 'var(--text-2)',
                        border: '1px solid ' + (form.role === r ? ROLE_TONE[r] : 'var(--border)'),
                      }}>
                      {r}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[10.5px] text-[color:var(--text-3)]">
                  {form.role === 'ADMIN' && '⚠ Acesso total — pode criar/remover outros admins, alterar saldos.'}
                  {form.role === 'OPERATOR' && 'Operação dia-a-dia: criar eventos, abrir mercados, aprovar saques.'}
                  {form.role === 'AUDITOR' && 'Apenas leitura + auditoria de liquidações.'}
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost flex-1 justify-center" onClick={() => setCreateOpen(false)} disabled={busy}>Cancelar</button>
              <button className="btn btn-primary flex-1 justify-center" onClick={create} disabled={busy}>
                {busy ? <><span className="pulse-dot"/> Criando…</> : <><I.Check size={14}/> Cadastrar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Ajustar Saldo ── */}
      {adjustUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
          <div className="surface-elev p-6 w-full max-w-md">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <I.Wallet size={18}/>
              </div>
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">Ajustar saldo</div>
                <div className="text-[12px] text-[color:var(--text-3)] truncate">{adjustUser.name} · {adjustUser.tag}</div>
                <div className="text-[11px] mt-1">Saldo atual: <strong>R$ {adjustUser.points.toFixed(2)}</strong></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <button className="btn"
                onClick={() => setAdjust((a) => ({ ...a, operation: 'CREDIT' }))}
                style={{ background: adjust.operation === 'CREDIT' ? 'var(--emerald-soft)' : 'var(--surface-2)', color: adjust.operation === 'CREDIT' ? 'var(--emerald)' : 'var(--text-2)' }}>
                <I.Plus size={13}/> Creditar
              </button>
              <button className="btn"
                onClick={() => setAdjust((a) => ({ ...a, operation: 'DEBIT' }))}
                style={{ background: adjust.operation === 'DEBIT' ? 'var(--rose-soft)' : 'var(--surface-2)', color: adjust.operation === 'DEBIT' ? 'var(--rose)' : 'var(--text-2)' }}>
                <I.X size={13}/> Debitar
              </button>
            </div>

            <div className="mb-3">
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Valor (R$)</label>
              <input className="input mt-1 font-mono text-[16px]" inputMode="decimal" value={adjust.amount}
                onChange={(e) => setAdjust((a) => ({ ...a, amount: e.target.value }))}/>
            </div>

            <div className="mb-4">
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Motivo (auditável)</label>
              <input className="input mt-1" value={adjust.reason}
                onChange={(e) => setAdjust((a) => ({ ...a, reason: e.target.value }))}
                placeholder="Ex.: estorno transação 12345"/>
            </div>

            <div className="rounded-[10px] px-3 py-2 text-[11.5px] mb-4"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              ⚠ Ação registrada em auditoria. Será visível em /auditoria.
            </div>

            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1 justify-center" onClick={() => setAdjustUser(null)} disabled={busy}>Cancelar</button>
              <button className="btn btn-primary flex-1 justify-center" onClick={submitAdjust} disabled={busy || !adjust.amount || !adjust.reason}>
                {busy ? <><span className="pulse-dot"/> Aplicando…</> : <><I.Check size={14}/> Confirmar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
