'use client';

import { useEffect, useMemo, useState } from 'react';
import { BirthdateInput } from '@/components/forms/birthdate-input';
import { MainNav } from '@/components/site/main-nav';
import { apiFetch } from '@/lib/api-request';
const fetchWithCredentials = apiFetch;
import { clearClientSession, getStoredUser, SessionUser, setStoredUser } from '@/lib/auth';

import { getPublicApiUrl } from '@/lib/env-public';
import { maskCPF, unmaskCPF } from '@/lib/masks';

const apiUrl = getPublicApiUrl();

type AdminDashboard = {
  usersTotal: number;
  activeUsers: number;
  eventsTotal: number;
  duelsTotal: number;
  openMarkets: number;
  pendingPayments: number;
  ledgerVolume: number;
};

type AdminUser = {
  id: string;
  email: string;
  name: string;
  cpf: string;
  birthDate: string;
  role: 'USER' | 'ADMIN' | 'OPERATOR' | 'AUDITOR';
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  wallet?: { id: string; balance: string | number; currency: string } | null;
};

type AdminDriver = { id: string; name: string; nickname?: string | null; active: boolean };
type AdminCar = { id: string; name: string; category: string; number?: string | null; active: boolean; driver: { id: string; name: string } };
type AdminEvent = { id: string; name: string; sport: string; status: string; startAt: string };
type AdminSetting = { id: string; key: string; value: string; description?: string | null };
type AuditLog = { id: string; action: string; entity: string; createdAt: string; actorUser?: { email: string } | null };

type AnalyticsOverview = {
  dashboard: AdminDashboard;
  profitability: {
    totalBets: number;
    wonBets: number;
    grossStake: number;
    predictedPayout: number;
    paidOut: number;
    refunded: number;
    net: number;
    marginPercent: number;
  };
  engagement: {
    newUsers7d: number;
    newUsers30d: number;
    bets30d: number;
    activeBettors30d: number;
    activeDepositors30d: number;
    betsPerActiveUser: number;
  };
  generatedAt: string;
};

type EventPerformanceRow = {
  eventId: string;
  eventName: string;
  startsAt: string;
  betsCount: number;
  totalStake: number;
};

type MarketConfig = { marginPercent: number; minBetAmount: number };
type LiveProfit = { totalVolume: number; totalRake: number; markets: Array<{ name: string; type: string; pool: number; rake: number }> };

type AdminSection = 'config' | 'user' | 'driver' | 'car' | 'market' | 'affiliate' | 'profit' | 'setting' | 'analytics' | 'audit';

type AdminMarket = {
  id: string; name: string; type: string; status: string;
  rakePercent?: string | number | null; bookingCloseAt?: string | null; settledAt?: string | null; winnerOddId?: string | null;
  event: { id: string; name: string };
  odds: Array<{ id: string; label: string; value: string | number; status: string }>;
};
type AdminAffiliate = {
  id: string; name: string; code: string; commissionPct: string | number; active: boolean;
  _count: { referredUsers: number; commissions: number };
  commissions: Array<{ amount: string | number }>;
};
type ProfitByMarket = {
  marketId: string; marketName: string; marketType: string; eventName: string; winnerLabel: string;
  totalPool: number; rakePercent: number; rakeCollected: number; affiliatePayouts: number; netProfit: number; settledAt: string | null;
};
type ProfitSummary = {
  settledMarkets: number; totalPool: number; totalRake: number; totalAffiliatePayouts: number; totalNetProfit: number; averageRakePercent: number;
};

const ADMIN_SECTIONS: { id: AdminSection; title: string; description: string }[] = [
  { id: 'config', title: 'Config Motor', description: 'Comissao da casa, aposta minima e lucro em tempo real.' },
  { id: 'user', title: 'Cadastro de usuario', description: 'CRUD de contas, roles e ajuste de saldo.' },
  { id: 'driver', title: 'Cadastro de piloto', description: 'CRUD completo de pilotos.' },
  { id: 'car', title: 'Cadastro de carro', description: 'CRUD completo de carros.' },
  { id: 'market', title: 'Mercados Multi-Runner', description: 'Criar, liquidar e gerenciar mercados especiais.' },
  { id: 'affiliate', title: 'Afiliados', description: 'Gestao de afiliados e comissoes.' },
  { id: 'profit', title: 'Lucro & Dashboard', description: 'Lucro por mercado e resumo financeiro.' },
  { id: 'setting', title: 'Configuracoes globais', description: 'CRUD de parametros globais.' },
  { id: 'analytics', title: 'Relatorios e Analytics', description: 'Metricas de negocio, lucratividade e exportacao.' },
  { id: 'audit', title: 'Auditoria', description: 'Rastro completo de operacoes administrativas.' },
];

type ModalState = {
  open: boolean;
  title: string;
  message: string;
  mode: 'confirm' | 'input' | 'select';
  inputLabel?: string;
  inputDefault?: string;
  selectOptions?: string[];
  danger?: boolean;
  onConfirm: (value?: string) => void;
};

const MODAL_CLOSED: ModalState = { open: false, title: '', message: '', mode: 'confirm', onConfirm: () => {} };

export default function AdminPage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>('user');
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);

  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [drivers, setDrivers] = useState<AdminDriver[]>([]);
  const [cars, setCars] = useState<AdminCar[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [analyticsOverview, setAnalyticsOverview] = useState<AnalyticsOverview | null>(null);
  const [analyticsEvents, setAnalyticsEvents] = useState<EventPerformanceRow[]>([]);
  const [markets, setMarkets] = useState<AdminMarket[]>([]);
  const [affiliates, setAffiliates] = useState<AdminAffiliate[]>([]);
  const [profitByMarket, setProfitByMarket] = useState<ProfitByMarket[]>([]);
  const [profitSummary, setProfitSummary] = useState<ProfitSummary | null>(null);
  const [marketConfig, setMarketConfig] = useState<MarketConfig>({ marginPercent: 20, minBetAmount: 10 });
  const [liveProfit, setLiveProfit] = useState<LiveProfit | null>(null);

  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', cpf: '', birthDate: '', role: 'USER' });
  const [newDriver, setNewDriver] = useState({ name: '', nickname: '' });
  const [newCar, setNewCar] = useState({ driverId: '', name: '', category: '', number: '' });
  const [newSetting, setNewSetting] = useState({ key: '', value: '', description: '' });

  const isAllowed = useMemo(() => !!sessionUser && ['ADMIN', 'OPERATOR'].includes(sessionUser.role), [sessionUser]);

  const [modal, setModal] = useState<ModalState>(MODAL_CLOSED);

  function askInput(title: string, label: string, defaultValue: string, cb: (val: string) => void) {
    setModal({ open: true, title, message: '', mode: 'input', inputLabel: label, inputDefault: defaultValue, onConfirm: (v) => { if (v) cb(v); } });
  }

  function askConfirm(title: string, msg: string, cb: () => void) {
    setModal({ open: true, title, message: msg, mode: 'confirm', danger: true, onConfirm: () => cb() });
  }

  function askSelect(title: string, options: string[], defaultValue: string, cb: (val: string) => void) {
    setModal({ open: true, title, message: '', mode: 'select', selectOptions: options, inputDefault: defaultValue, onConfirm: (v) => { if (v) cb(v); } });
  }

  useEffect(() => {
    setSessionUser(getStoredUser());
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithCredentials(`${apiUrl}/auth/me`, { cache: 'no-store' });
        if (!res.ok) {
          clearClientSession();
          setSessionUser(null);
          return;
        }
        const me = (await res.json()) as SessionUser;
        setSessionUser(me);
        setStoredUser(me);
      } catch {
        setSessionUser(null);
      } finally {
        setSessionReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!sessionReady || !isAllowed) return;
    void loadData();
  }, [sessionReady, isAllowed]);

  async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchWithCredentials(`${apiUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (response.status === 401 || response.status === 403) {
      clearClientSession();
      setSessionUser(null);
      throw new Error('Sessão expirada ou sem permissão. Faça login novamente.');
    }

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as T;
  }

  async function loadData() {
    setLoading(true);
    setStatusMessage('');
    try {
      const [
        dashboardRes,
        usersRes,
        driversRes,
        carsRes,
        eventsRes,
        settingsRes,
        auditRes,
        overviewRes,
        perfRes,
        marketsRes,
        affiliatesRes,
        profitRes,
        profitSumRes,
        configRes,
        liveProfitRes,
      ] = await Promise.all([
        fetchWithCredentials(`${apiUrl}/admin/dashboard`, {}),
        fetchWithCredentials(`${apiUrl}/admin/users`, {}),
        fetchWithCredentials(`${apiUrl}/admin/drivers`, {}),
        fetchWithCredentials(`${apiUrl}/admin/cars`, {}),
        fetchWithCredentials(`${apiUrl}/admin/events`, {}),
        fetchWithCredentials(`${apiUrl}/admin/settings`, {}),
        fetchWithCredentials(`${apiUrl}/admin/audit-logs?limit=40`, {}),
        fetchWithCredentials(`${apiUrl}/admin/analytics/overview`, {}),
        fetchWithCredentials(`${apiUrl}/admin/analytics/events?limit=20`, {}),
        fetchWithCredentials(`${apiUrl}/admin/markets`, {}),
        fetchWithCredentials(`${apiUrl}/admin/affiliates`, {}),
        fetchWithCredentials(`${apiUrl}/admin/analytics/profit-by-market`, {}),
        fetchWithCredentials(`${apiUrl}/admin/analytics/profit-summary`, {}),
        fetchWithCredentials(`${apiUrl}/market/config`, {}),
        fetchWithCredentials(`${apiUrl}/market/profit-live`, {}),
      ]);

      for (const res of [dashboardRes, usersRes, driversRes, carsRes, eventsRes, settingsRes, overviewRes, perfRes]) {
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            clearClientSession();
            setSessionUser(null);
          }
          throw new Error('Falha ao carregar painel administrativo');
        }
      }

      setDashboard((await dashboardRes.json()) as AdminDashboard);
      setUsers((await usersRes.json()) as AdminUser[]);
      setDrivers((await driversRes.json()) as AdminDriver[]);
      setCars((await carsRes.json()) as AdminCar[]);
      setEvents((await eventsRes.json()) as AdminEvent[]);
      setSettings((await settingsRes.json()) as AdminSetting[]);
      setAnalyticsOverview((await overviewRes.json()) as AnalyticsOverview);
      setAnalyticsEvents((await perfRes.json()) as EventPerformanceRow[]);

      if (auditRes.ok) setAuditLogs((await auditRes.json()) as AuditLog[]);
      if (marketsRes.ok) setMarkets((await marketsRes.json()) as AdminMarket[]);
      if (affiliatesRes.ok) setAffiliates((await affiliatesRes.json()) as AdminAffiliate[]);
      if (profitRes.ok) setProfitByMarket((await profitRes.json()) as ProfitByMarket[]);
      if (profitSumRes.ok) setProfitSummary((await profitSumRes.json()) as ProfitSummary);
      if (configRes.ok) setMarketConfig((await configRes.json()) as MarketConfig);
      if (liveProfitRes.ok) setLiveProfit((await liveProfitRes.json()) as LiveProfit);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Erro ao carregar painel');
    } finally {
      setLoading(false);
    }
  }

  async function submit(label: string, action: () => Promise<unknown>) {
    setLoading(true);
    setStatusMessage('');
    try {
      await action();
      if (isAllowed) await loadData();
      setStatusMessage(`${label} realizado com sucesso.`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : `Falha em ${label}`);
    } finally {
      setLoading(false);
    }
  }

  async function exportAnalytics(type: 'users' | 'events' | 'bets' | 'transactions', format: 'json' | 'csv') {
    await submit(`Exportação ${type}`, async () => {
      const result = await adminJson<{ filename: string; data: unknown; format: 'json' | 'csv' }>(
        `/admin/analytics/export?type=${type}&format=${format}&limit=500`,
      );

      const payload = format === 'csv' ? String(result.data ?? '') : JSON.stringify(result.data, null, 2);
      const blob = new Blob([payload], { type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    });
  }

  if (!sessionReady) {
    return (
      <main className='min-h-screen bg-[#090b11] text-white'>
        <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
          <MainNav />
          <p className='mt-10 text-center text-white/50'>Carregando…</p>
        </div>
      </main>
    );
  }

  if (!sessionUser) {
    return (
      <main className='min-h-screen bg-[#090b11] text-white'>
        <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
          <MainNav />
          <section className='mt-8 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-6'>
            <h1 className='text-2xl font-bold'>Acesso administrativo necessário</h1>
            <p className='mt-2 text-white/80'>Faça login como admin/operator para abrir este painel.</p>
            <a href='/login' className='mt-4 inline-flex rounded-lg bg-amber-400 px-4 py-2 font-bold text-black'>Ir para login</a>
          </section>
        </div>
      </main>
    );
  }

  if (!isAllowed) {
    return (
      <main className='min-h-screen bg-[#090b11] text-white'>
        <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
          <MainNav />
          <section className='mt-8 rounded-2xl border border-red-400/40 bg-red-500/10 p-6'>
            <h1 className='text-2xl font-bold'>Permissão insuficiente</h1>
            <p className='mt-2 text-white/80'>Seu perfil atual não possui acesso ao painel admin.</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className='min-h-screen bg-[#090b11] pb-10 text-white'>
      <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
        <MainNav />

        <section className='mt-2 rounded-2xl border border-white/10 bg-[#101525] p-5 sm:p-6'>
          <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30'>Painel administrativo</p>
          <h1 className='mt-2 text-2xl font-semibold sm:text-3xl tracking-tight'>Gestão completa, segura e auditável</h1>
          {statusMessage ? <p className='mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70'>{statusMessage}</p> : null}

          {dashboard ? (
            <div className='mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              <Metric label='Usuários' value={dashboard.usersTotal} />
              <Metric label='Ativos' value={dashboard.activeUsers} />
              <Metric label='Eventos' value={dashboard.eventsTotal} />
              <Metric label='Embates' value={dashboard.duelsTotal} />
              <Metric label='Mercados abertos' value={dashboard.openMarkets} />
              <Metric label='Pagamentos pendentes' value={dashboard.pendingPayments} />
              <Metric label='Ledger volume' value={`R$ ${dashboard.ledgerVolume.toLocaleString('pt-BR')}`} />
            </div>
          ) : null}

          <div className='mt-5 flex flex-wrap gap-2'>
            <a
              href='/admin/listas'
              className='inline-flex items-center gap-2 rounded-xl border border-[#d4a843]/30 bg-[#d4a843]/10 px-4 py-2 text-xs font-bold text-[#d4a843] transition hover:bg-[#d4a843]/20'
            >
              <span>🏁 Listas Brasil</span>
              <span className='text-[#d4a843]/70'>— cadastro de eventos, embates e gestão de listas</span>
            </a>
          </div>
        </section>

        {/* Mobile: Dropdown section selector */}
        <div className='mt-6 md:hidden'>
          <button
            type='button'
            onClick={() => setSectionMenuOpen((v) => !v)}
            className='flex w-full items-center justify-between rounded-2xl border border-white/10 bg-[#101525] px-4 py-3.5 text-sm font-medium transition-all hover:bg-[#141a2e]'
          >
            <div className='flex items-center gap-3'>
              <span className='h-2 w-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]' />
              {ADMIN_SECTIONS.find((s) => s.id === activeSection)?.title}
            </div>
            <svg className={`h-4 w-4 text-white/40 transition-transform duration-300 ${sectionMenuOpen ? 'rotate-180' : ''}`} fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
              <path strokeLinecap='round' strokeLinejoin='round' d='M19 9l-7 7-7-7' />
            </svg>
          </button>
          
          <div className={`mt-2 overflow-hidden rounded-2xl border bg-[#101525] transition-all duration-300 ease-out ${sectionMenuOpen ? 'max-h-[500px] opacity-100 border-white/10' : 'max-h-0 opacity-0 border-transparent'}`}>
            {ADMIN_SECTIONS.map((section) => (
              <button
                key={section.id}
                type='button'
                onClick={() => { setActiveSection(section.id); setSectionMenuOpen(false); }}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors ${activeSection === section.id ? 'bg-white/5 text-white' : 'text-white/40 hover:bg-white/5 hover:text-white/70'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full transition-all ${activeSection === section.id ? 'bg-white scale-100' : 'bg-transparent scale-0'}`} />
                <div className='min-w-0'>
                  <p className='font-medium'>{section.title}</p>
                  <p className='text-[10px] text-white/30 mt-0.5'>{section.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Desktop: Card grid */}
        <section className='mt-6 hidden md:block'>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
            {ADMIN_SECTIONS.map((section) => (
              <button
                key={section.id}
                className={`rounded-2xl border p-4 text-left transition-all duration-300 ${
                  activeSection === section.id
                    ? 'border-white/20 bg-white/5 shadow-[0_0_15px_rgba(255,255,255,0.03)]'
                    : 'border-white/10 bg-[#101525] hover:border-white/15 hover:bg-[#141a2e]'
                }`}
                type='button'
                onClick={() => setActiveSection(section.id)}
              >
                <p className='text-sm font-medium'>{section.title}</p>
                <p className='mt-1.5 text-xs text-white/40'>{section.description}</p>
              </button>
            ))}
          </div>
        </section>

        {/* ── Config do Motor ── */}
        {activeSection === 'config' ? (
          <Panel title='Configurações do Motor de Odds'>
            <div className='grid grid-cols-1 gap-6 sm:grid-cols-2'>
              {/* Comissão da Casa */}
              <div className='rounded-xl border border-white/10 bg-white/5 p-5'>
                <p className='text-xs uppercase tracking-widest text-white/50 mb-3'>Comissão da Casa %</p>
                <div className='flex gap-2'>
                  <input
                    id='cfgMargin'
                    type='number'
                    min={0}
                    max={50}
                    defaultValue={marketConfig.marginPercent}
                    className='flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-2xl font-bold text-white outline-none'
                  />
                  <button
                    className='rounded-lg bg-emerald-500 px-6 py-3 text-sm font-bold text-black'
                    onClick={() => {
                      const val = Number((document.getElementById('cfgMargin') as HTMLInputElement).value);
                      void submit('Atualizar comissão', () => apiFetch(`${apiUrl}/admin/config/margin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: val }) }));
                    }}
                  >
                    Salvar
                  </button>
                </div>
                <p className='mt-2 text-xs text-white/30'>Porcentagem retida pela casa sobre cada pote. Atual: {marketConfig.marginPercent}%</p>
              </div>

              {/* Aposta Mínima */}
              <div className='rounded-xl border border-white/10 bg-white/5 p-5'>
                <p className='text-xs uppercase tracking-widest text-white/50 mb-3'>Aposta Mínima R$</p>
                <div className='flex gap-2'>
                  <input
                    id='cfgMinBet'
                    type='number'
                    min={0}
                    defaultValue={marketConfig.minBetAmount}
                    className='flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-2xl font-bold text-white outline-none'
                  />
                  <button
                    className='rounded-lg bg-emerald-500 px-6 py-3 text-sm font-bold text-black'
                    onClick={() => {
                      const val = Number((document.getElementById('cfgMinBet') as HTMLInputElement).value);
                      void submit('Atualizar aposta mínima', () => apiFetch(`${apiUrl}/admin/config/min-bet`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: val }) }));
                    }}
                  >
                    Salvar
                  </button>
                </div>
                <p className='mt-2 text-xs text-white/30'>Valor mínimo aceito por aposta. Atual: R$ {marketConfig.minBetAmount.toFixed(2)}</p>
              </div>
            </div>

            {/* Lucro em Tempo Real */}
            {liveProfit && (
              <div className='mt-6'>
                <p className='text-xs uppercase tracking-widest text-white/50 mb-3'>Lucro em Tempo Real (antes de liquidar)</p>
                <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 mb-4'>
                  <Metric label='Volume Total' value={`R$ ${liveProfit.totalVolume.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                  <Metric label='Rake Total (estimado)' value={`R$ ${liveProfit.totalRake.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                  <Metric label='Mercados Ativos' value={liveProfit.markets.length} />
                </div>
                <div className='space-y-2 max-h-64 overflow-auto'>
                  {liveProfit.markets.map((m, i) => (
                    <div key={`${m.name}-${i}`} className='flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3 text-sm'>
                      <div>
                        <span className='font-medium'>{m.name}</span>
                        <span className='ml-2 text-xs text-white/30'>{m.type}</span>
                      </div>
                      <div className='text-right'>
                        <span className='text-white/50'>Pool: R$ {m.pool.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        <span className='ml-3 font-bold text-emerald-400'>Rake: R$ {m.rake.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  ))}
                  {!liveProfit.markets.length && <p className='text-sm text-white/40'>Nenhum mercado ativo.</p>}
                </div>
              </div>
            )}
          </Panel>
        ) : null}

        {activeSection === 'user' ? (
          <Panel title='Cadastro e gestão de usuários'>
            <form
              className='grid gap-2 md:grid-cols-2'
              onSubmit={(e) => {
                e.preventDefault();
                void submit('Cadastro de usuário', () =>
                  adminJson('/admin/users', {
                    method: 'POST',
                    body: JSON.stringify({ ...newUser, cpf: unmaskCPF(newUser.cpf), status: 'ACTIVE' }),
                  }),
                );
              }}
            >
              <input className='field' placeholder='Nome' value={newUser.name} onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))} required />
              <input className='field' placeholder='E-mail' type='email' value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} required />
              <input className='field' placeholder='Senha forte' type='password' value={newUser.password} onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))} required />
              <input className='field' placeholder='CPF' inputMode='numeric' value={maskCPF(newUser.cpf)} onChange={(e) => setNewUser((p) => ({ ...p, cpf: unmaskCPF(e.target.value).slice(0, 11) }))} required />
              <div className='md:col-span-2'>
                <BirthdateInput
                  value={newUser.birthDate}
                  onChange={(iso) => setNewUser((p) => ({ ...p, birthDate: iso }))}
                  id='admin-new-user-birth'
                />
              </div>
              <select className='field' value={newUser.role} onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}>
                <option value='USER'>USER</option>
                <option value='OPERATOR'>OPERATOR</option>
                <option value='AUDITOR'>AUDITOR</option>
                <option value='ADMIN'>ADMIN</option>
              </select>
              <button className='btn-primary md:col-span-2' disabled={loading}>Salvar usuário</button>
            </form>

            <div className='mt-5 space-y-2'>
              {users.map((u) => (
                <article key={u.id} className='rounded-lg border border-white/10 bg-white/5 p-3'>
                  <p className='text-sm font-semibold'>{u.name} • {u.email}</p>
                  <p className='text-xs text-white/70'>Role: {u.role} • Status: {u.status} • Saldo: R$ {Number(u.wallet?.balance ?? 0).toFixed(2)}</p>
                  <div className='mt-2 flex flex-wrap gap-2'>
                    <button
                      className='rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20'
                      type='button'
                      onClick={() => askSelect('Editar role', ['USER', 'ADMIN', 'OPERATOR', 'AUDITOR'], u.role, (role) => {
                        void submit('Atualização de usuário', () =>
                          adminJson(`/admin/users/${u.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ role }),
                          }),
                        );
                      })}
                    >
                      Editar role
                    </button>
                    <button
                      className='rounded-md bg-emerald-500/20 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/30'
                      type='button'
                      onClick={() => askInput('Adicionar saldo', 'Valor em R$', '', (amount) => {
                        void submit('Adicionar saldo', () =>
                          adminJson(`/admin/users/${u.id}/wallet-adjust`, {
                            method: 'POST',
                            body: JSON.stringify({ operation: 'ADD', amount: Number(amount), reason: 'admin-credit' }),
                          }),
                        );
                      })}
                    >
                      + Saldo
                    </button>
                    <button
                      className='rounded-md bg-amber-500/20 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/30'
                      type='button'
                      onClick={() => askInput('Remover saldo', 'Valor em R$', '', (amount) => {
                        void submit('Remover saldo', () =>
                          adminJson(`/admin/users/${u.id}/wallet-adjust`, {
                            method: 'POST',
                            body: JSON.stringify({ operation: 'REMOVE', amount: Number(amount), reason: 'admin-debit' }),
                          }),
                        );
                      })}
                    >
                      - Saldo
                    </button>
                    <button
                      className='rounded-md bg-red-500/20 px-2 py-1 text-xs text-red-200 hover:bg-red-500/30'
                      type='button'
                      onClick={() => askConfirm('Desativar usuário', `Desativar ${u.email}?`, () => {
                        void submit('Desativação de usuário', () => adminJson(`/admin/users/${u.id}`, { method: 'DELETE' }));
                      })}
                    >
                      Desativar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        ) : null}

        {activeSection === 'driver' ? (
          <Panel title='Cadastro e CRUD de pilotos'>
            <form
              className='space-y-2'
              onSubmit={(e) => {
                e.preventDefault();
                void submit('Cadastro de piloto', () => adminJson('/admin/drivers', { method: 'POST', body: JSON.stringify(newDriver) }));
              }}
            >
              <input className='field' placeholder='Nome do piloto' value={newDriver.name} onChange={(e) => setNewDriver((p) => ({ ...p, name: e.target.value }))} required />
              <input className='field' placeholder='Apelido (opcional)' value={newDriver.nickname} onChange={(e) => setNewDriver((p) => ({ ...p, nickname: e.target.value }))} />
              <button className='btn-primary' disabled={loading}>Salvar piloto</button>
            </form>

            <div className='mt-5 space-y-2'>
              {drivers.map((driver) => (
                <article key={driver.id} className='rounded-lg border border-white/10 bg-white/5 p-3'>
                  <p className='font-semibold'>{driver.name}{driver.nickname ? ` (${driver.nickname})` : ''}</p>
                  <p className='text-xs text-white/70'>{driver.active ? 'Ativo' : 'Inativo'}</p>
                  <div className='mt-2 flex gap-2'>
                    <button
                      type='button'
                      className='rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20'
                      onClick={() => askInput('Editar piloto', 'Nome', driver.name, (name) => {
                        void submit('Atualização de piloto', () => adminJson(`/admin/drivers/${driver.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }));
                      })}
                    >
                      Editar
                    </button>
                    <button
                      type='button'
                      className='rounded-md bg-red-500/20 px-2 py-1 text-xs text-red-200 hover:bg-red-500/30'
                      onClick={() => askConfirm('Desativar piloto', `Desativar ${driver.name}?`, () => {
                        void submit('Desativação de piloto', () => adminJson(`/admin/drivers/${driver.id}`, { method: 'DELETE' }));
                      })}
                    >
                      Desativar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        ) : null}

        {activeSection === 'car' ? (
          <Panel title='Cadastro e CRUD de carros'>
            <form
              className='space-y-2'
              onSubmit={(e) => {
                e.preventDefault();
                void submit('Cadastro de carro', () => adminJson('/admin/cars', { method: 'POST', body: JSON.stringify(newCar) }));
              }}
            >
              <select className='field' value={newCar.driverId} onChange={(e) => setNewCar((p) => ({ ...p, driverId: e.target.value }))} required>
                <option value=''>Selecione o piloto</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>{driver.name}</option>
                ))}
              </select>
              <input className='field' placeholder='Nome do carro' value={newCar.name} onChange={(e) => setNewCar((p) => ({ ...p, name: e.target.value }))} required />
              <input className='field' placeholder='Categoria' value={newCar.category} onChange={(e) => setNewCar((p) => ({ ...p, category: e.target.value }))} required />
              <input className='field' placeholder='Número' value={newCar.number} onChange={(e) => setNewCar((p) => ({ ...p, number: e.target.value }))} />
              <button className='btn-primary' disabled={loading}>Salvar carro</button>
            </form>

            <div className='mt-5 space-y-2'>
              {cars.map((car) => (
                <article key={car.id} className='rounded-lg border border-white/10 bg-white/5 p-3'>
                  <p className='font-semibold'>{car.name} • {car.category} • {car.driver.name}</p>
                  <p className='text-xs text-white/70'>{car.active ? 'Ativo' : 'Inativo'}</p>
                  <div className='mt-2 flex gap-2'>
                    <button
                      type='button'
                      className='rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20'
                      onClick={() => askInput('Editar carro', 'Categoria', car.category, (category) => {
                        void submit('Atualização de carro', () => adminJson(`/admin/cars/${car.id}`, { method: 'PATCH', body: JSON.stringify({ category }) }));
                      })}
                    >
                      Editar
                    </button>
                    <button
                      type='button'
                      className='rounded-md bg-red-500/20 px-2 py-1 text-xs text-red-200 hover:bg-red-500/30'
                      onClick={() => askConfirm('Desativar carro', `Desativar ${car.name}?`, () => {
                        void submit('Desativação de carro', () => adminJson(`/admin/cars/${car.id}`, { method: 'DELETE' }));
                      })}
                    >
                      Desativar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        ) : null}

        {activeSection === 'setting' ? (
          <Panel title='Configurações globais (CRUD)'>
            <form
              className='space-y-2'
              onSubmit={(e) => {
                e.preventDefault();
                void submit('Configuração global', () => adminJson('/admin/settings', { method: 'POST', body: JSON.stringify(newSetting) }));
              }}
            >
              <input className='field' placeholder='KEY_EXEMPLO' value={newSetting.key} onChange={(e) => setNewSetting((p) => ({ ...p, key: e.target.value }))} required />
              <input className='field' placeholder='Valor' value={newSetting.value} onChange={(e) => setNewSetting((p) => ({ ...p, value: e.target.value }))} required />
              <input className='field' placeholder='Descrição' value={newSetting.description} onChange={(e) => setNewSetting((p) => ({ ...p, description: e.target.value }))} />
              <button className='btn-primary' disabled={loading}>Salvar configuração</button>
            </form>

            <div className='mt-5 space-y-2'>
              {settings.map((setting) => (
                <article key={setting.id} className='rounded-lg border border-white/10 bg-white/5 p-3'>
                  <p className='font-semibold'>{setting.key}</p>
                  <p className='text-xs text-white/70'>{setting.value} {setting.description ? `• ${setting.description}` : ''}</p>
                  <div className='mt-2 flex gap-2'>
                    <button
                      type='button'
                      className='rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20'
                      onClick={() => askInput('Editar configuração', `Valor para ${setting.key}`, setting.value, (value) => {
                        void submit('Atualização de configuração', () =>
                          adminJson('/admin/settings', {
                            method: 'POST',
                            body: JSON.stringify({ key: setting.key, value, description: setting.description }),
                          }),
                        );
                      })}
                    >
                      Editar
                    </button>
                    <button
                      type='button'
                      className='rounded-md bg-red-500/20 px-2 py-1 text-xs text-red-200 hover:bg-red-500/30'
                      onClick={() => askConfirm('Excluir configuração', `Excluir ${setting.key}?`, () => {
                        void submit('Exclusão de configuração', () => adminJson(`/admin/settings/${setting.id}`, { method: 'DELETE' }));
                      })}
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        ) : null}

        {activeSection === 'analytics' ? (
          <Panel title='Relatórios e Analytics'>
            {analyticsOverview ? (
              <>
                <div className='grid gap-3 md:grid-cols-3'>
                  <Metric label='Gross Stake' value={`R$ ${analyticsOverview.profitability.grossStake.toFixed(2)}`} />
                  <Metric label='Net' value={`R$ ${analyticsOverview.profitability.net.toFixed(2)}`} />
                  <Metric label='Margem' value={`${analyticsOverview.profitability.marginPercent}%`} />
                  <Metric label='Novos usuários (7d)' value={analyticsOverview.engagement.newUsers7d} />
                  <Metric label='Apostadores ativos (30d)' value={analyticsOverview.engagement.activeBettors30d} />
                  <Metric label='Bets por usuário ativo' value={analyticsOverview.engagement.betsPerActiveUser} />
                </div>

                <div className='mt-5 rounded-xl border border-white/10 bg-white/5 p-3'>
                  <p className='text-sm font-bold'>Desempenho de eventos</p>
                  <div className='mt-2 space-y-2'>
                    {analyticsEvents.map((row) => (
                      <p key={row.eventId} className='text-sm text-white/80'>
                        {row.eventName} • Bets: {row.betsCount} • Stake: R$ {row.totalStake.toFixed(2)}
                      </p>
                    ))}
                  </div>
                </div>

                <div className='mt-5 rounded-xl border border-white/10 bg-white/5 p-3'>
                  <p className='text-sm font-bold'>Exportação de dados</p>
                  <div className='mt-3 flex flex-wrap gap-2'>
                    <button className='rounded-md bg-white/10 px-3 py-1 text-xs hover:bg-white/20' type='button' onClick={() => void exportAnalytics('users', 'csv')}>Usuários CSV</button>
                    <button className='rounded-md bg-white/10 px-3 py-1 text-xs hover:bg-white/20' type='button' onClick={() => void exportAnalytics('events', 'csv')}>Eventos CSV</button>
                    <button className='rounded-md bg-white/10 px-3 py-1 text-xs hover:bg-white/20' type='button' onClick={() => void exportAnalytics('bets', 'json')}>Apostas JSON</button>
                    <button className='rounded-md bg-white/10 px-3 py-1 text-xs hover:bg-white/20' type='button' onClick={() => void exportAnalytics('transactions', 'csv')}>Transações CSV</button>
                  </div>
                </div>
              </>
            ) : (
              <p className='text-sm text-white/70'>Carregando analytics...</p>
            )}
          </Panel>
        ) : null}

        {/* ── Mercados Multi-Runner ── */}
        {activeSection === 'market' ? (
          <Panel title='Mercados Multi-Runner'>
            <div className='mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4'>
              <input id='mrName' placeholder='Nome do mercado' className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none' />
              <select id='mrType' className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none'>
                <option value='WINNER'>Vencedor Geral</option>
                <option value='BEST_REACTION'>Melhor Reacao</option>
                <option value='FALSE_START'>Queimada</option>
              </select>
              <select id='mrEvent' className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none'>
                {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <input id='mrRunners' placeholder='Opcoes (separar por virgula)' className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none' />
            </div>
            <div className='mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3'>
              <input id='mrRake' type='number' placeholder='Rake % (padrao 6)' className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none' />
              <input id='mrClose' type='datetime-local' className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none' />
              <button
                className='rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-black'
                onClick={() => {
                  const name = (document.getElementById('mrName') as HTMLInputElement).value;
                  const type = (document.getElementById('mrType') as HTMLSelectElement).value;
                  const eventId = (document.getElementById('mrEvent') as HTMLSelectElement).value;
                  const runners = (document.getElementById('mrRunners') as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean);
                  const rakePercent = Number((document.getElementById('mrRake') as HTMLInputElement).value) || undefined;
                  const bookingCloseAt = (document.getElementById('mrClose') as HTMLInputElement).value || undefined;
                  if (!name || !eventId || runners.length < 2) { setStatusMessage('Informe nome, evento e pelo menos 2 opcoes'); return; }
                  void submit('Criar mercado', () => apiFetch(`${apiUrl}/admin/markets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, type, eventId, runners, rakePercent, bookingCloseAt }) }));
                }}
              >
                + Criar Mercado
              </button>
            </div>
            <div className='space-y-3 max-h-96 overflow-auto'>
              {markets.map((m) => (
                <div key={m.id} className='rounded-xl border border-white/10 bg-white/5 p-4'>
                  <div className='flex items-start justify-between mb-2'>
                    <div>
                      <p className='font-semibold'>{m.name}</p>
                      <p className='text-xs text-white/40'>{m.type} - {m.event.name} - Status: {m.status}</p>
                    </div>
                    <div className='flex gap-2'>
                      {m.status !== 'SETTLED' && (
                        <>
                          <select
                            id={`settle-${m.id}`}
                            className='rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none'
                          >
                            {m.odds.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                          <button
                            className='rounded-lg bg-emerald-500/80 px-3 py-1 text-xs font-bold text-black'
                            onClick={() => {
                              const winnerOddId = (document.getElementById(`settle-${m.id}`) as HTMLSelectElement).value;
                              if (!winnerOddId) return;
                              void submit('Liquidar mercado', () => apiFetch(`${apiUrl}/admin/markets/${m.id}/settle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ winnerOddId }) }));
                            }}
                          >
                            Liquidar
                          </button>
                          <button
                            className='rounded-lg bg-red-500/80 px-3 py-1 text-xs font-bold text-white'
                            onClick={() => void submit('Anular mercado', () => apiFetch(`${apiUrl}/admin/markets/${m.id}/void`, { method: 'POST' }))}
                          >
                            Anular
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className='flex flex-wrap gap-2'>
                    {m.odds.map((o) => (
                      <span key={o.id} className={`rounded-full px-3 py-1 text-xs border ${o.id === m.winnerOddId ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-white/5 border-white/10 text-white/60'}`}>
                        {o.label} {o.id === m.winnerOddId && '(Vencedor)'}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {!markets.length && <p className='text-sm text-white/40'>Nenhum mercado multi-runner criado.</p>}
            </div>
          </Panel>
        ) : null}

        {/* ── Afiliados ── */}
        {activeSection === 'affiliate' ? (
          <Panel title='Gestao de Afiliados'>
            <div className='mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4'>
              <input id='afName' placeholder='Nome' className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none' />
              <input id='afCode' placeholder='Codigo' className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none' />
              <input id='afPct' type='number' placeholder='Comissao %' className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none' />
              <button
                className='rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-black'
                onClick={() => {
                  const name = (document.getElementById('afName') as HTMLInputElement).value;
                  const code = (document.getElementById('afCode') as HTMLInputElement).value;
                  const commissionPct = Number((document.getElementById('afPct') as HTMLInputElement).value);
                  if (!name || !code || !commissionPct) { setStatusMessage('Preencha todos os campos'); return; }
                  void submit('Criar afiliado', () => apiFetch(`${apiUrl}/admin/affiliates`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, code, commissionPct }) }));
                }}
              >
                + Criar Afiliado
              </button>
            </div>
            <div className='space-y-3 max-h-96 overflow-auto'>
              {affiliates.map((af) => {
                const totalCommission = af.commissions.reduce((s, c) => s + Number(c.amount), 0);
                return (
                  <div key={af.id} className='rounded-xl border border-white/10 bg-white/5 p-4 flex items-center justify-between'>
                    <div>
                      <p className='font-semibold'>{af.name} <span className='text-xs text-white/40'>({af.code})</span></p>
                      <p className='text-xs text-white/40'>
                        Comissao: {Number(af.commissionPct)}% - Usuarios: {af._count.referredUsers} - Pagamentos: {af._count.commissions}
                      </p>
                      <p className='text-xs text-yellow-400'>Total comissoes: R$ {totalCommission.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className='flex gap-2'>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${af.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {af.active ? 'ATIVO' : 'INATIVO'}
                      </span>
                      {af.active && (
                        <button
                          className='rounded-lg bg-red-500/60 px-3 py-1 text-xs font-bold text-white'
                          onClick={() => void submit('Desativar afiliado', () => apiFetch(`${apiUrl}/admin/affiliates/${af.id}`, { method: 'DELETE' }))}
                        >
                          Desativar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {!affiliates.length && <p className='text-sm text-white/40'>Nenhum afiliado cadastrado.</p>}
            </div>
          </Panel>
        ) : null}

        {/* ── Lucro & Dashboard ── */}
        {activeSection === 'profit' ? (
          <Panel title='Lucro & Dashboard'>
            {profitSummary && (
              <div className='mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
                <Metric label='Mercados Liquidados' value={profitSummary.settledMarkets} />
                <Metric label='Volume Total' value={`R$ ${profitSummary.totalPool.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                <Metric label='Rake Total' value={`R$ ${profitSummary.totalRake.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                <Metric label='Comissoes Afiliados' value={`R$ ${profitSummary.totalAffiliatePayouts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                <Metric label='Lucro Liquido' value={`R$ ${profitSummary.totalNetProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} />
                <Metric label='Margem Media' value={`${profitSummary.averageRakePercent.toFixed(1)}%`} />
              </div>
            )}
            <div className='space-y-3 max-h-96 overflow-auto'>
              {profitByMarket.map((m) => (
                <div key={m.marketId} className='rounded-xl border border-white/10 bg-white/5 p-4'>
                  <div className='flex items-start justify-between'>
                    <div>
                      <p className='font-semibold'>{m.marketName}</p>
                      <p className='text-xs text-white/40'>{m.marketType} - {m.eventName} - Vencedor: {m.winnerLabel}</p>
                    </div>
                    <p className='text-sm font-bold text-emerald-400'>R$ {m.netProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className='mt-2 flex gap-4 text-xs text-white/50'>
                    <span>Pool: R$ {m.totalPool.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span>Rake ({m.rakePercent}%): R$ {m.rakeCollected.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span>Afiliados: R$ {m.affiliatePayouts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              ))}
              {!profitByMarket.length && <p className='text-sm text-white/40'>Nenhum mercado liquidado ainda.</p>}
            </div>
          </Panel>
        ) : null}

        {activeSection === 'audit' ? (
          <Panel title='Auditoria'>
            <ListBlock items={auditLogs.map((a) => `${a.action} • ${a.entity} • ${new Date(a.createdAt).toLocaleString('pt-BR')} • ${a.actorUser?.email ?? 'sistema'}`)} />
          </Panel>
        ) : null}
      </div>
      {modal.open && <AdminModal state={modal} onClose={() => setModal(MODAL_CLOSED)} />}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className='rounded-xl border border-white/10 bg-white/5 p-3'>
      <p className='text-xs uppercase tracking-[0.1em] text-white/60'>{label}</p>
      <p className='mt-1 text-xl font-extrabold'>{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className='mt-6 rounded-2xl border border-white/10 bg-[#101525] p-4'>
      <h2 className='mb-3 text-xl font-bold'>{title}</h2>
      {children}
    </section>
  );
}

function ListBlock({ items }: { items: string[] }) {
  if (!items.length) {
    return <p className='text-sm text-white/60'>Sem dados no momento.</p>;
  }

  return (
    <div className='max-h-80 space-y-2 overflow-auto pr-1'>
      {items.map((item, idx) => (
        <p key={`${item}-${idx}`} className='rounded-lg border border-white/10 bg-white/5 p-2 text-sm'>
          {item}
        </p>
      ))}
    </div>
  );
}

function AdminModal({ state, onClose }: { state: ModalState; onClose: () => void }) {
  const [inputValue, setInputValue] = useState(state.inputDefault ?? '');

  return (
    <div className='fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4' onClick={onClose}>
      <div
        className='w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[#101525] p-6 shadow-2xl'
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex items-center justify-between mb-4'>
          <h3 className='text-lg font-bold'>{state.title}</h3>
          <button type='button' onClick={onClose} className='flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/40 hover:bg-white/10 hover:text-white transition-colors'>
            <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
              <line x1='18' y1='6' x2='6' y2='18' /><line x1='6' y1='6' x2='18' y2='18' />
            </svg>
          </button>
        </div>

        {state.message && <p className='text-sm text-white/60 mb-4'>{state.message}</p>}

        {state.mode === 'input' && (
          <div className='mb-5'>
            {state.inputLabel && <label className='block text-xs font-medium text-white/50 mb-1.5'>{state.inputLabel}</label>}
            <input
              className='field text-lg'
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { state.onConfirm(inputValue); onClose(); } }}
            />
          </div>
        )}

        {state.mode === 'select' && (
          <div className='mb-5 flex flex-col gap-1.5'>
            {state.selectOptions?.map((opt) => (
              <button
                key={opt}
                type='button'
                className={`rounded-xl px-4 py-3 text-left text-sm font-medium transition-all ${inputValue === opt ? 'bg-white text-black' : 'bg-white/5 text-white/70 hover:bg-white/10'}`}
                onClick={() => setInputValue(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        <div className='flex gap-3 mt-2'>
          <button
            type='button'
            className='flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-sm font-semibold text-white/70 hover:bg-white/10 transition-colors touch-manipulation'
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type='button'
            className={`flex-1 rounded-xl px-4 py-3.5 text-sm font-bold transition-colors touch-manipulation ${
              state.danger
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'bg-white text-black hover:bg-white/90'
            }`}
            onClick={() => { state.onConfirm(state.mode === 'confirm' ? undefined : inputValue); onClose(); }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
