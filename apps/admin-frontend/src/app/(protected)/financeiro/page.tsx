'use client';

import * as React from 'react';
import { I } from '@/components/ui/icons';
import { Page, Card, Avatar, StatusChip } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { api } from '@/lib/api';
import { ENDPOINTS } from '@/lib/endpoints';

type HoldReason = 'HIGH_AMOUNT' | 'CPF_MISMATCH' | null;

type PaymentRow = {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  amount: number | string;
  status: 'PENDING' | 'APPROVED' | 'FAILED' | 'CANCELED';
  provider: string;
  providerRef: string | null;
  pixKey: string | null;
  pixKeyType: string | null;
  holdReason: HoldReason;
  receiverDocument: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string; name: string; cpf?: string | null };
};

type PaymentsList = {
  items: PaymentRow[];
  total: number;
  limit: number;
  offset: number;
};

type PendingWithdraw = PaymentRow;

type PaymentsSummary = {
  hours: number;
  deposits: { approvedCount: number; approvedAmount: number; pendingCount: number };
  withdrawals: { approvedCount: number; approvedAmount: number; pendingCount: number; pendingAmount: number };
};

type Tab = 'pending' | 'withdrawals' | 'deposits';

const STATUS_LABEL: Record<PaymentRow['status'], string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  FAILED: 'Falhou',
  CANCELED: 'Cancelado',
};
const STATUS_TONE: Record<PaymentRow['status'], { bg: string; fg: string }> = {
  PENDING: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  APPROVED: { bg: 'var(--emerald-soft)', fg: 'var(--emerald)' },
  FAILED: { bg: 'var(--rose-soft)', fg: '#ff7585' },
  CANCELED: { bg: 'var(--surface-3)', fg: 'var(--text-3)' },
};

const PIX_KEY_LABEL: Record<string, string> = {
  document: 'CPF/CNPJ', phone: 'Telefone', email: 'E-mail', evp: 'Aleatória',
};

const HOLD_REASON_LABEL: Record<NonNullable<HoldReason>, string> = {
  HIGH_AMOUNT: 'Alto valor',
  CPF_MISMATCH: 'CPF divergente',
};
const HOLD_REASON_TONE: Record<NonNullable<HoldReason>, { bg: string; fg: string }> = {
  HIGH_AMOUNT: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  CPF_MISMATCH: { bg: 'var(--rose-soft)', fg: 'var(--rose)' },
};

function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return iso;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '??';
}

const POLL_MS = 8000;

export default function FinanceiroPage() {
  const [tab, setTab] = React.useState<Tab>('pending');
  const [summary, setSummary] = React.useState<PaymentsSummary | null>(null);
  const [lastUpdate, setLastUpdate] = React.useState<Date>(new Date());

  const loadSummary = React.useCallback(async () => {
    try {
      setSummary(await api.get<PaymentsSummary>(ENDPOINTS.PAYMENTS.summary(24)));
      setLastUpdate(new Date());
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => {
    void loadSummary();
    const i = setInterval(loadSummary, POLL_MS);
    return () => clearInterval(i);
  }, [loadSummary]);

  return (
    <Page
      eyebrow="Financeiro"
      title="Financeiro"
      sub="Depósitos, saques e solicitações de aprovação. Atualizado em tempo real."
      actions={
        <span className="text-[11.5px] text-[color:var(--text-3)] flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: 'var(--emerald)' }}/>
          Tempo real · {lastUpdate.toLocaleTimeString('pt-BR')}
        </span>
      }
    >
      {/* KPIs (24h) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <Card className="p-4">
          <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Depósitos 24h</div>
          <div className="font-display text-[22px] font-bold mt-1 tabular-nums" style={{ color: 'var(--emerald)' }}>
            {summary ? fmtBRL(summary.deposits.approvedAmount) : '—'}
          </div>
          <div className="text-[11px] text-[color:var(--text-3)] mt-0.5">{summary?.deposits.approvedCount ?? 0} aprovados</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Saques 24h</div>
          <div className="font-display text-[22px] font-bold mt-1 tabular-nums" style={{ color: '#ff7585' }}>
            {summary ? fmtBRL(summary.withdrawals.approvedAmount) : '—'}
          </div>
          <div className="text-[11px] text-[color:var(--text-3)] mt-0.5">{summary?.withdrawals.approvedCount ?? 0} liquidados</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Pendente análise</div>
          <div className="font-display text-[22px] font-bold mt-1 tabular-nums" style={{ color: 'var(--accent)' }}>
            {summary?.withdrawals.pendingCount ?? 0}
          </div>
          <div className="text-[11px] text-[color:var(--text-3)] mt-0.5">{summary ? fmtBRL(summary.withdrawals.pendingAmount) : '—'} a pagar</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Depósitos pendentes</div>
          <div className="font-display text-[22px] font-bold mt-1 tabular-nums" style={{ color: 'var(--accent)' }}>
            {summary?.deposits.pendingCount ?? 0}
          </div>
          <div className="text-[11px] text-[color:var(--text-3)] mt-0.5">aguardando webhook</div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 surface-2 rounded-[12px] p-1 mb-5 w-fit">
        {([
          { id: 'pending' as const, label: 'Solicitações de saque', icon: <I.Shield size={13}/>, count: summary?.withdrawals.pendingCount },
          { id: 'withdrawals' as const, label: 'Saques (histórico)', icon: <I.Wallet size={13}/>, count: undefined },
          { id: 'deposits' as const, label: 'Depósitos', icon: <I.Download size={13}/>, count: undefined },
        ]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 text-[12.5px] font-semibold rounded-[8px] flex items-center gap-1.5"
            style={{
              background: tab === t.id ? 'var(--surface-3)' : 'transparent',
              color: tab === t.id ? 'var(--text)' : 'var(--text-3)',
            }}
          >
            {t.icon} {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'pending' && <PendingApprovalsTab onAfterAction={loadSummary}/>}
      {tab === 'withdrawals' && <PaymentsHistoryTab type="WITHDRAW"/>}
      {tab === 'deposits' && <PaymentsHistoryTab type="DEPOSIT"/>}
    </Page>
  );
}

/* ── Solicitações de saque (review pendente) ───────────── */

const PendingApprovalsTab: React.FC<{ onAfterAction?: () => void }> = ({ onAfterAction }) => {
  const [list, setList] = React.useState<PendingWithdraw[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [rejectFor, setRejectFor] = React.useState<PendingWithdraw | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');
  const { push } = useToast();
  const confirm = useConfirm();

  // Mantém callback fresca sem invalidar `load` — evita loop de refetch quando
  // o parent re-renderiza por causa de polling de summary.
  const onAfterActionRef = React.useRef(onAfterAction);
  React.useEffect(() => { onAfterActionRef.current = onAfterAction; }, [onAfterAction]);

  const load = React.useCallback(async () => {
    try { setList(await api.get<PendingWithdraw[]>(ENDPOINTS.WITHDRAWALS.listPending)); }
    catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setLoading(false); }
  }, [push]);

  React.useEffect(() => {
    void load();
    const i = setInterval(load, POLL_MS);
    return () => clearInterval(i);
  }, [load]);

  const approve = async (p: PendingWithdraw) => {
    const ok = await confirm({
      title: 'Aprovar saque?',
      body: <>Vai disparar o PIX <strong>{fmtBRL(Number(p.amount))}</strong> para <strong>{p.user.email}</strong> via Valut. A operação é irreversível.</>,
      tone: 'warning',
      confirmLabel: 'Aprovar e disparar PIX',
      icon: 'Check',
    });
    if (!ok) return;
    setBusy(p.id);
    try {
      await api.post(ENDPOINTS.WITHDRAWALS.approve(p.id));
      push({ title: 'Saque aprovado', body: `${p.user.email} · ${fmtBRL(Number(p.amount))}`, tone: 'emerald' });
      await load();
      onAfterActionRef.current?.();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const reject = async () => {
    if (!rejectFor) return;
    setBusy(rejectFor.id);
    try {
      await api.post(ENDPOINTS.WITHDRAWALS.reject(rejectFor.id), { reason: rejectReason.trim() || undefined });
      push({ title: 'Saque rejeitado', body: `Saldo devolvido a ${rejectFor.user.email}`, tone: 'amber' });
      setRejectFor(null); setRejectReason('');
      await load();
      onAfterActionRef.current?.();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  if (loading && list.length === 0) {
    return <Card className="p-12 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</Card>;
  }

  if (list.length === 0) {
    return (
      <Card className="p-12 text-center">
        <div className="w-12 h-12 rounded-[12px] grid place-items-center mx-auto" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
          <I.Check size={20}/>
        </div>
        <div className="font-display text-[15px] font-semibold mt-3">Nada pendente</div>
        <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">Saques que precisam de revisão manual aparecem aqui automaticamente.</div>
      </Card>
    );
  }

  return (
    <Card className="p-0 overflow-hidden">
      <table>
        <thead>
          <tr>
            <th style={{ paddingLeft: 20 }}>Usuário</th>
            <th>Chave PIX</th>
            <th className="text-right">Valor</th>
            <th>Solicitado</th>
            <th>Motivo</th>
            <th style={{ paddingRight: 20 }}/>
          </tr>
        </thead>
        <tbody>
          {list.map((p, i) => {
            const value = Number(p.amount);
            return (
              <tr key={p.id}>
                <td style={{ paddingLeft: 20 }}>
                  <div className="flex items-center gap-3">
                    <Avatar initials={initials(p.user.name)} size={32} tone={['amber','sky','violet','emerald','rose'][i % 5]}/>
                    <div>
                      <div className="font-semibold text-[13px]">{p.user.name}</div>
                      <div className="text-[11px] text-[color:var(--text-3)] font-mono">{p.user.email}</div>
                      {p.user.cpf && <div className="text-[10.5px] text-[color:var(--text-3)] font-mono mt-0.5">CPF · {p.user.cpf}</div>}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="text-[12px] font-mono">{p.pixKey ?? '—'}</div>
                  <div className="text-[10.5px] text-[color:var(--text-3)]">{p.pixKeyType ? PIX_KEY_LABEL[p.pixKeyType] ?? p.pixKeyType : ''}</div>
                  {p.receiverDocument && (
                    <div className="text-[10.5px] mt-0.5 font-mono" style={{ color: p.holdReason === 'CPF_MISMATCH' ? 'var(--rose)' : 'var(--text-3)' }}>
                      Destino · {p.receiverDocument}
                    </div>
                  )}
                </td>
                <td className="text-right tabular-nums font-mono font-bold text-[14px]">{fmtBRL(value)}</td>
                <td className="text-[11.5px] text-[color:var(--text-3)]">
                  {new Date(p.createdAt).toLocaleString('pt-BR')}
                  <div className="text-[10.5px]">{timeAgo(p.createdAt)}</div>
                </td>
                <td>
                  {p.holdReason ? (
                    <span className="text-[10.5px] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-full"
                      style={{ background: HOLD_REASON_TONE[p.holdReason].bg, color: HOLD_REASON_TONE[p.holdReason].fg }}>
                      {HOLD_REASON_LABEL[p.holdReason]}
                    </span>
                  ) : <span className="text-[color:var(--text-3)] text-[11.5px]">—</span>}
                </td>
                <td className="text-right" style={{ paddingRight: 20 }}>
                  <div className="flex justify-end gap-2">
                    <button
                      className="btn"
                      onClick={() => void approve(p)}
                      disabled={busy === p.id}
                      style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}
                    >
                      <I.Check size={13}/> Aprovar
                    </button>
                    <button
                      className="btn"
                      onClick={() => { setRejectFor(p); setRejectReason(''); }}
                      disabled={busy === p.id}
                      style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}
                    >
                      <I.X size={13}/> Rejeitar
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rejectFor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center cmdk-overlay p-4">
          <div className="surface-elev p-6 w-full max-w-md">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-[12px] grid place-items-center" style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}>
                <I.X size={18}/>
              </div>
              <div className="flex-1">
                <div className="font-display text-[18px] font-bold">Rejeitar saque</div>
                <div className="text-[12px] text-[color:var(--text-3)]">{rejectFor.user.email} · {fmtBRL(Number(rejectFor.amount))}</div>
              </div>
            </div>
            <div className="rounded-[10px] p-3 mb-4 text-[12px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
              ⚠ O valor será devolvido ao saldo do usuário automaticamente. Operação auditada.
            </div>
            <div>
              <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Motivo (opcional, visível pro usuário)</label>
              <textarea className="input mt-1" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Ex: chave PIX divergente do CPF cadastrado"/>
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn btn-ghost flex-1 justify-center" onClick={() => setRejectFor(null)} disabled={!!busy}>Cancelar</button>
              <button className="btn btn-primary flex-1 justify-center"
                onClick={reject} disabled={!!busy}
                style={{ background: 'var(--rose)', color: '#fff' }}>
                {busy ? <><span className="pulse-dot"/> Rejeitando…</> : <><I.X size={14}/> Confirmar rejeição</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

/* ── Histórico de pagamentos (depósitos OU saques) ────── */

const PaymentsHistoryTab: React.FC<{ type: 'DEPOSIT' | 'WITHDRAW' }> = ({ type }) => {
  const [list, setList] = React.useState<PaymentsList | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<'all' | 'PENDING' | 'APPROVED' | 'FAILED' | 'CANCELED'>('all');
  const [search, setSearch] = React.useState('');
  const [searchDebounced, setSearchDebounced] = React.useState('');
  const [page, setPage] = React.useState(0);
  const limit = 50;

  React.useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => { setPage(0); }, [status, searchDebounced]);

  const load = React.useCallback(async () => {
    const url = type === 'DEPOSIT'
      ? ENDPOINTS.PAYMENTS.deposits({ status, search: searchDebounced || undefined, limit, offset: page * limit })
      : ENDPOINTS.PAYMENTS.withdrawals({ status, search: searchDebounced || undefined, limit, offset: page * limit });
    try { setList(await api.get<PaymentsList>(url)); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [type, status, searchDebounced, page]);

  React.useEffect(() => {
    setLoading(true);
    void load();
    const i = setInterval(load, POLL_MS);
    return () => clearInterval(i);
  }, [load]);

  const totalPages = list ? Math.max(1, Math.ceil(list.total / limit)) : 1;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center gap-3 p-4 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex-1 relative min-w-[260px]">
          <I.Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-3)' }}/>
          <input
            className="input pl-9"
            placeholder="Buscar por nome, email, CPF, chave PIX…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 surface-2 rounded-[12px] p-1">
          {([
            { id: 'all' as const, label: 'Todos' },
            { id: 'PENDING' as const, label: 'Pendentes' },
            { id: 'APPROVED' as const, label: 'Aprovados' },
            { id: 'FAILED' as const, label: 'Falharam' },
            { id: 'CANCELED' as const, label: 'Cancelados' },
          ]).map((f) => (
            <button
              key={f.id}
              onClick={() => setStatus(f.id)}
              className="px-2.5 py-1.5 text-[12px] font-semibold rounded-[8px]"
              style={{ background: status === f.id ? 'var(--surface-3)' : 'transparent', color: status === f.id ? 'var(--text)' : 'var(--text-3)' }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !list && <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</div>}

      {list && list.items.length === 0 && (
        <div className="p-12 text-center">
          <div className="w-12 h-12 rounded-[12px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)' }}>
            <I.Receipt size={20} style={{ color: 'var(--text-3)' }}/>
          </div>
          <div className="font-display text-[15px] font-semibold mt-3">Nenhum {type === 'DEPOSIT' ? 'depósito' : 'saque'} encontrado</div>
          <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">
            {searchDebounced || status !== 'all'
              ? 'Tente ajustar os filtros acima.'
              : type === 'DEPOSIT' ? 'Depósitos aparecerão aqui em tempo real.' : 'Saques aparecerão aqui em tempo real.'}
          </div>
        </div>
      )}

      {list && list.items.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th style={{ paddingLeft: 20 }}>Usuário</th>
                {type === 'WITHDRAW' && <th>Chave PIX / Destino</th>}
                {type === 'DEPOSIT' && <th>Provider</th>}
                <th className="text-right">Valor</th>
                <th>Status</th>
                <th style={{ paddingRight: 20 }}>Quando</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((p, i) => {
                const value = Number(p.amount);
                return (
                  <tr key={p.id}>
                    <td style={{ paddingLeft: 20 }}>
                      <div className="flex items-center gap-3">
                        <Avatar initials={initials(p.user.name)} size={30} tone={['amber','sky','violet','emerald','rose'][i % 5]}/>
                        <div>
                          <div className="font-semibold text-[12.5px]">{p.user.name}</div>
                          <div className="text-[10.5px] text-[color:var(--text-3)] font-mono">{p.user.email}</div>
                        </div>
                      </div>
                    </td>
                    {type === 'WITHDRAW' && (
                      <td>
                        <div className="text-[11.5px] font-mono">{p.pixKey ?? '—'}</div>
                        <div className="text-[10.5px] text-[color:var(--text-3)]">
                          {p.pixKeyType ? PIX_KEY_LABEL[p.pixKeyType] ?? p.pixKeyType : ''}
                          {p.receiverDocument && p.holdReason === 'CPF_MISMATCH' && (
                            <span style={{ color: 'var(--rose)' }}> · destino {p.receiverDocument}</span>
                          )}
                        </div>
                      </td>
                    )}
                    {type === 'DEPOSIT' && (
                      <td>
                        <div className="text-[11.5px] font-mono">{p.provider}</div>
                        {p.providerRef && (
                          <div className="text-[10.5px] text-[color:var(--text-3)] font-mono truncate" style={{ maxWidth: 160 }}>
                            {p.providerRef}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="text-right tabular-nums font-mono font-bold text-[13.5px]"
                      style={{ color: type === 'DEPOSIT' && p.status === 'APPROVED' ? 'var(--emerald)' : type === 'WITHDRAW' && p.status === 'APPROVED' ? '#ff7585' : undefined }}>
                      {type === 'DEPOSIT' ? '+' : '−'}{fmtBRL(value)}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10.5px] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-full"
                          style={{ background: STATUS_TONE[p.status].bg, color: STATUS_TONE[p.status].fg }}>
                          {STATUS_LABEL[p.status]}
                        </span>
                        {p.holdReason && (
                          <span className="text-[10px] font-semibold tracking-[0.06em] uppercase px-1.5 py-0.5 rounded-full"
                            style={{ background: HOLD_REASON_TONE[p.holdReason].bg, color: HOLD_REASON_TONE[p.holdReason].fg }}>
                            {HOLD_REASON_LABEL[p.holdReason]}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-[11.5px] text-[color:var(--text-3)]" style={{ paddingRight: 20 }}>
                      {timeAgo(p.createdAt)}
                      <div className="text-[10px] text-[color:var(--text-4)]">{new Date(p.createdAt).toLocaleString('pt-BR')}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer / paginação */}
          <div className="flex items-center justify-between p-4 text-[12px] text-[color:var(--text-3)]" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              Mostrando {list.offset + 1}–{list.offset + list.items.length} de {list.total}
            </div>
            <div className="flex items-center gap-2">
              <button className="btn btn-ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <I.ChevronLeft size={13}/> Anterior
              </button>
              <span className="tabular-nums">{page + 1} / {totalPages}</span>
              <button className="btn btn-ghost" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Próxima <I.ChevronRight size={13}/>
              </button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
};
