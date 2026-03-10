'use client';

import { useEffect, useMemo, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { clearAuthToken, getAuthToken, getStoredUser, SessionUser, setStoredUser } from '@/lib/auth';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3502/api';

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
type AdminDuel = {
  id: string;
  status: string;
  startsAt: string;
  bookingCloseAt: string;
  event: { id: string; name: string };
  leftCar: { id: string; name: string; driver: { name: string } };
  rightCar: { id: string; name: string; driver: { name: string } };
};
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

type AdminSection = 'user' | 'event' | 'driver' | 'car' | 'duel' | 'setting' | 'analytics' | 'audit';

const ADMIN_SECTIONS: { id: AdminSection; title: string; description: string }[] = [
  { id: 'user', title: 'Cadastro de usuário', description: 'CRUD de contas, roles e ajuste de saldo.' },
  { id: 'event', title: 'Cadastro de evento', description: 'CRUD de eventos e controle de status.' },
  { id: 'driver', title: 'Cadastro de piloto', description: 'CRUD completo de pilotos.' },
  { id: 'car', title: 'Cadastro de carro', description: 'CRUD completo de carros.' },
  { id: 'duel', title: 'Cadastro de embate', description: 'CRUD completo de embates.' },
  { id: 'setting', title: 'Configurações globais', description: 'CRUD de parâmetros globais.' },
  { id: 'analytics', title: 'Relatórios e Analytics', description: 'Métricas de negócio, lucratividade e exportação.' },
  { id: 'audit', title: 'Auditoria', description: 'Rastro completo de operações administrativas.' },
];

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
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
  const [duels, setDuels] = useState<AdminDuel[]>([]);
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const [analyticsOverview, setAnalyticsOverview] = useState<AnalyticsOverview | null>(null);
  const [analyticsEvents, setAnalyticsEvents] = useState<EventPerformanceRow[]>([]);

  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', cpf: '', birthDate: '', role: 'OPERATOR' });
  const [newEvent, setNewEvent] = useState({
    sport: 'DRAG_RACE',
    name: '',
    startAt: '',
    marketName: '',
    oddALabel: 'Carro A',
    oddAValue: '1.80',
    oddBLabel: 'Carro B',
    oddBValue: '1.90',
  });
  const [newDriver, setNewDriver] = useState({ name: '', nickname: '' });
  const [newCar, setNewCar] = useState({ driverId: '', name: '', category: '', number: '' });
  const [newDuel, setNewDuel] = useState({ eventId: '', leftCarId: '', rightCarId: '', startsAt: '', bookingCloseAt: '', status: 'BOOKING_OPEN', notes: '' });
  const [newSetting, setNewSetting] = useState({ key: '', value: '', description: '' });

  const isAllowed = useMemo(() => !!sessionUser && ['ADMIN', 'OPERATOR'].includes(sessionUser.role), [sessionUser]);

  useEffect(() => {
    setToken(getAuthToken());
    setSessionUser(getStoredUser());
  }, []);

  useEffect(() => {
    if (!token) return;

    void (async () => {
      try {
        const res = await fetch(`${apiUrl}/auth/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (!res.ok) {
          clearAuthToken();
          setToken(null);
          setSessionUser(null);
          return;
        }
        const me = (await res.json()) as SessionUser;
        setSessionUser(me);
        setStoredUser(me);
      } catch {
        // keep current local state
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!token || !isAllowed) return;
    void loadData(token);
  }, [token, isAllowed]);

  async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
    if (!token) throw new Error('Sem token de autenticação');

    const response = await fetch(`${apiUrl}${url}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });

    if (response.status === 401 || response.status === 403) {
      clearAuthToken();
      setToken(null);
      throw new Error('Sessão expirada ou sem permissão. Faça login novamente.');
    }

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as T;
  }

  async function loadData(authToken: string) {
    setLoading(true);
    setStatusMessage('');
    try {
      const headers = { Authorization: `Bearer ${authToken}` };
      const [dashboardRes, usersRes, driversRes, carsRes, eventsRes, duelsRes, settingsRes, auditRes, overviewRes, perfRes] = await Promise.all([
        fetch(`${apiUrl}/admin/dashboard`, { headers }),
        fetch(`${apiUrl}/admin/users`, { headers }),
        fetch(`${apiUrl}/admin/drivers`, { headers }),
        fetch(`${apiUrl}/admin/cars`, { headers }),
        fetch(`${apiUrl}/admin/events`, { headers }),
        fetch(`${apiUrl}/admin/duels`, { headers }),
        fetch(`${apiUrl}/admin/settings`, { headers }),
        fetch(`${apiUrl}/admin/audit-logs?limit=40`, { headers }),
        fetch(`${apiUrl}/admin/analytics/overview`, { headers }),
        fetch(`${apiUrl}/admin/analytics/events?limit=20`, { headers }),
      ]);

      for (const res of [dashboardRes, usersRes, driversRes, carsRes, eventsRes, duelsRes, settingsRes, overviewRes, perfRes]) {
        if (!res.ok) throw new Error('Falha ao carregar painel administrativo');
      }

      setDashboard((await dashboardRes.json()) as AdminDashboard);
      setUsers((await usersRes.json()) as AdminUser[]);
      setDrivers((await driversRes.json()) as AdminDriver[]);
      setCars((await carsRes.json()) as AdminCar[]);
      setEvents((await eventsRes.json()) as AdminEvent[]);
      setDuels((await duelsRes.json()) as AdminDuel[]);
      setSettings((await settingsRes.json()) as AdminSetting[]);
      setAnalyticsOverview((await overviewRes.json()) as AnalyticsOverview);
      setAnalyticsEvents((await perfRes.json()) as EventPerformanceRow[]);

      if (auditRes.ok) {
        setAuditLogs((await auditRes.json()) as AuditLog[]);
      }
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
      if (token) await loadData(token);
      setStatusMessage(`${label} realizado com sucesso.`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : `Falha em ${label}`);
    } finally {
      setLoading(false);
    }
  }

  async function exportAnalytics(type: 'users' | 'events' | 'bets' | 'transactions', format: 'json' | 'csv') {
    await submit(`Exportação ${type}`, async () => {
      const result = await apiFetch<{ filename: string; data: unknown; format: 'json' | 'csv' }>(
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

  if (!token || !sessionUser) {
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

        {activeSection === 'user' ? (
          <Panel title='Cadastro e gestão de usuários'>
            <form
              className='grid gap-2 md:grid-cols-2'
              onSubmit={(e) => {
                e.preventDefault();
                void submit('Cadastro de usuário', () =>
                  apiFetch('/admin/users', {
                    method: 'POST',
                    body: JSON.stringify({ ...newUser, cpf: newUser.cpf.replace(/\D/g, ''), status: 'ACTIVE' }),
                  }),
                );
              }}
            >
              <input className='field' placeholder='Nome' value={newUser.name} onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))} required />
              <input className='field' placeholder='E-mail' type='email' value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} required />
              <input className='field' placeholder='Senha forte' type='password' value={newUser.password} onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))} required />
              <input className='field' placeholder='CPF (11 dígitos)' value={newUser.cpf} onChange={(e) => setNewUser((p) => ({ ...p, cpf: e.target.value.replace(/\D/g, '').slice(0, 11) }))} required />
              <input className='field' type='date' value={newUser.birthDate} onChange={(e) => setNewUser((p) => ({ ...p, birthDate: e.target.value }))} required />
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
                      onClick={() => {
                        const role = prompt('Nova role (USER/ADMIN/OPERATOR/AUDITOR):', u.role);
                        if (!role) return;
                        void submit('Atualização de usuário', () =>
                          apiFetch(`/admin/users/${u.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ role }),
                          }),
                        );
                      }}
                    >
                      Editar role
                    </button>
                    <button
                      className='rounded-md bg-emerald-500/20 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-500/30'
                      type='button'
                      onClick={() => {
                        const amount = prompt('Valor para adicionar no saldo:');
                        if (!amount) return;
                        void submit('Adicionar saldo', () =>
                          apiFetch(`/admin/users/${u.id}/wallet-adjust`, {
                            method: 'POST',
                            body: JSON.stringify({ operation: 'ADD', amount: Number(amount), reason: 'admin-credit' }),
                          }),
                        );
                      }}
                    >
                      + Saldo
                    </button>
                    <button
                      className='rounded-md bg-amber-500/20 px-2 py-1 text-xs text-amber-200 hover:bg-amber-500/30'
                      type='button'
                      onClick={() => {
                        const amount = prompt('Valor para remover do saldo:');
                        if (!amount) return;
                        void submit('Remover saldo', () =>
                          apiFetch(`/admin/users/${u.id}/wallet-adjust`, {
                            method: 'POST',
                            body: JSON.stringify({ operation: 'REMOVE', amount: Number(amount), reason: 'admin-debit' }),
                          }),
                        );
                      }}
                    >
                      - Saldo
                    </button>
                    <button
                      className='rounded-md bg-red-500/20 px-2 py-1 text-xs text-red-200 hover:bg-red-500/30'
                      type='button'
                      onClick={() => {
                        if (!confirm(`Desativar usuário ${u.email}?`)) return;
                        void submit('Desativação de usuário', () => apiFetch(`/admin/users/${u.id}`, { method: 'DELETE' }));
                      }}
                    >
                      Desativar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        ) : null}

        {activeSection === 'event' ? (
          <Panel title='Cadastro e CRUD de eventos'>
            <form
              className='space-y-2'
              onSubmit={(e) => {
                e.preventDefault();
                void submit('Cadastro de evento', () =>
                  apiFetch('/admin/events', {
                    method: 'POST',
                    body: JSON.stringify({
                      sport: newEvent.sport,
                      name: newEvent.name,
                      startAt: new Date(newEvent.startAt).toISOString(),
                      status: 'SCHEDULED',
                      markets: [
                        {
                          name: newEvent.marketName,
                          status: 'OPEN',
                          odds: [
                            { label: newEvent.oddALabel, value: Number(newEvent.oddAValue), status: 'ACTIVE' },
                            { label: newEvent.oddBLabel, value: Number(newEvent.oddBValue), status: 'ACTIVE' },
                          ],
                        },
                      ],
                    }),
                  }),
                );
              }}
            >
              <input className='field' placeholder='Esporte (DRAG_RACE)' value={newEvent.sport} onChange={(e) => setNewEvent((p) => ({ ...p, sport: e.target.value }))} required />
              <input className='field' placeholder='Nome do evento' value={newEvent.name} onChange={(e) => setNewEvent((p) => ({ ...p, name: e.target.value }))} required />
              <input className='field' type='datetime-local' value={newEvent.startAt} onChange={(e) => setNewEvent((p) => ({ ...p, startAt: e.target.value }))} required />
              <input className='field' placeholder='Nome do mercado' value={newEvent.marketName} onChange={(e) => setNewEvent((p) => ({ ...p, marketName: e.target.value }))} required />
              <div className='grid grid-cols-2 gap-2'>
                <input className='field' placeholder='Label odd A' value={newEvent.oddALabel} onChange={(e) => setNewEvent((p) => ({ ...p, oddALabel: e.target.value }))} required />
                <input className='field' placeholder='Valor odd A' value={newEvent.oddAValue} onChange={(e) => setNewEvent((p) => ({ ...p, oddAValue: e.target.value }))} required />
              </div>
              <div className='grid grid-cols-2 gap-2'>
                <input className='field' placeholder='Label odd B' value={newEvent.oddBLabel} onChange={(e) => setNewEvent((p) => ({ ...p, oddBLabel: e.target.value }))} required />
                <input className='field' placeholder='Valor odd B' value={newEvent.oddBValue} onChange={(e) => setNewEvent((p) => ({ ...p, oddBValue: e.target.value }))} required />
              </div>
              <button className='btn-primary' disabled={loading}>Salvar evento</button>
            </form>

            <div className='mt-5 space-y-2'>
              {events.map((event) => (
                <article key={event.id} className='rounded-lg border border-white/10 bg-white/5 p-3'>
                  <p className='font-semibold'>{event.name}</p>
                  <p className='text-xs text-white/70'>{event.sport} • {new Date(event.startAt).toLocaleString('pt-BR')} • {event.status}</p>
                  <div className='mt-2 flex gap-2'>
                    <button
                      type='button'
                      className='rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20'
                      onClick={() => {
                        const name = prompt('Novo nome do evento:', event.name);
                        if (!name) return;
                        void submit('Atualização de evento', () => apiFetch(`/admin/events/${event.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }));
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type='button'
                      className='rounded-md bg-red-500/20 px-2 py-1 text-xs text-red-200 hover:bg-red-500/30'
                      onClick={() => {
                        if (!confirm(`Cancelar evento ${event.name}?`)) return;
                        void submit('Cancelamento de evento', () => apiFetch(`/admin/events/${event.id}`, { method: 'DELETE' }));
                      }}
                    >
                      Cancelar
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
                void submit('Cadastro de piloto', () => apiFetch('/admin/drivers', { method: 'POST', body: JSON.stringify(newDriver) }));
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
                      onClick={() => {
                        const name = prompt('Novo nome:', driver.name);
                        if (!name) return;
                        void submit('Atualização de piloto', () => apiFetch(`/admin/drivers/${driver.id}`, { method: 'PATCH', body: JSON.stringify({ name }) }));
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type='button'
                      className='rounded-md bg-red-500/20 px-2 py-1 text-xs text-red-200 hover:bg-red-500/30'
                      onClick={() => {
                        if (!confirm(`Desativar piloto ${driver.name}?`)) return;
                        void submit('Desativação de piloto', () => apiFetch(`/admin/drivers/${driver.id}`, { method: 'DELETE' }));
                      }}
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
                void submit('Cadastro de carro', () => apiFetch('/admin/cars', { method: 'POST', body: JSON.stringify(newCar) }));
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
                      onClick={() => {
                        const category = prompt('Nova categoria:', car.category);
                        if (!category) return;
                        void submit('Atualização de carro', () => apiFetch(`/admin/cars/${car.id}`, { method: 'PATCH', body: JSON.stringify({ category }) }));
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type='button'
                      className='rounded-md bg-red-500/20 px-2 py-1 text-xs text-red-200 hover:bg-red-500/30'
                      onClick={() => {
                        if (!confirm(`Desativar carro ${car.name}?`)) return;
                        void submit('Desativação de carro', () => apiFetch(`/admin/cars/${car.id}`, { method: 'DELETE' }));
                      }}
                    >
                      Desativar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        ) : null}

        {activeSection === 'duel' ? (
          <Panel title='Cadastro e CRUD de embates'>
            <form
              className='space-y-2'
              onSubmit={(e) => {
                e.preventDefault();
                void submit('Cadastro de embate', () =>
                  apiFetch('/admin/duels', {
                    method: 'POST',
                    body: JSON.stringify({
                      ...newDuel,
                      startsAt: new Date(newDuel.startsAt).toISOString(),
                      bookingCloseAt: new Date(newDuel.bookingCloseAt).toISOString(),
                    }),
                  }),
                );
              }}
            >
              <select className='field' value={newDuel.eventId} onChange={(e) => setNewDuel((p) => ({ ...p, eventId: e.target.value }))} required>
                <option value=''>Selecione o evento</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>{event.name}</option>
                ))}
              </select>
              <select className='field' value={newDuel.leftCarId} onChange={(e) => setNewDuel((p) => ({ ...p, leftCarId: e.target.value }))} required>
                <option value=''>Carro lado A</option>
                {cars.map((car) => (
                  <option key={car.id} value={car.id}>{car.name} ({car.driver.name})</option>
                ))}
              </select>
              <select className='field' value={newDuel.rightCarId} onChange={(e) => setNewDuel((p) => ({ ...p, rightCarId: e.target.value }))} required>
                <option value=''>Carro lado B</option>
                {cars.map((car) => (
                  <option key={car.id} value={car.id}>{car.name} ({car.driver.name})</option>
                ))}
              </select>
              <input className='field' type='datetime-local' value={newDuel.startsAt} onChange={(e) => setNewDuel((p) => ({ ...p, startsAt: e.target.value }))} required />
              <input className='field' type='datetime-local' value={newDuel.bookingCloseAt} onChange={(e) => setNewDuel((p) => ({ ...p, bookingCloseAt: e.target.value }))} required />
              <button className='btn-primary' disabled={loading}>Salvar embate</button>
            </form>

            <div className='mt-5 space-y-2'>
              {duels.map((duel) => (
                <article key={duel.id} className='rounded-lg border border-white/10 bg-white/5 p-3'>
                  <p className='font-semibold'>{duel.leftCar.name} x {duel.rightCar.name}</p>
                  <p className='text-xs text-white/70'>{duel.event.name} • {new Date(duel.startsAt).toLocaleString('pt-BR')} • {duel.status}</p>
                  <div className='mt-2 flex gap-2'>
                    <button
                      type='button'
                      className='rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20'
                      onClick={() => {
                        const status = prompt('Novo status (SCHEDULED/BOOKING_OPEN/BOOKING_CLOSED/FINISHED/CANCELED):', duel.status);
                        if (!status) return;
                        void submit('Atualização de embate', () => apiFetch(`/admin/duels/${duel.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }));
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type='button'
                      className='rounded-md bg-red-500/20 px-2 py-1 text-xs text-red-200 hover:bg-red-500/30'
                      onClick={() => {
                        if (!confirm('Cancelar este embate?')) return;
                        void submit('Cancelamento de embate', () => apiFetch(`/admin/duels/${duel.id}`, { method: 'DELETE' }));
                      }}
                    >
                      Cancelar
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
                void submit('Configuração global', () => apiFetch('/admin/settings', { method: 'POST', body: JSON.stringify(newSetting) }));
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
                      onClick={() => {
                        const value = prompt('Novo valor:', setting.value);
                        if (!value) return;
                        void submit('Atualização de configuração', () =>
                          apiFetch('/admin/settings', {
                            method: 'POST',
                            body: JSON.stringify({ key: setting.key, value, description: setting.description }),
                          }),
                        );
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type='button'
                      className='rounded-md bg-red-500/20 px-2 py-1 text-xs text-red-200 hover:bg-red-500/30'
                      onClick={() => {
                        if (!confirm(`Excluir configuração ${setting.key}?`)) return;
                        void submit('Exclusão de configuração', () => apiFetch(`/admin/settings/${setting.id}`, { method: 'DELETE' }));
                      }}
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

        {activeSection === 'audit' ? (
          <Panel title='Auditoria'>
            <ListBlock items={auditLogs.map((a) => `${a.action} • ${a.entity} • ${new Date(a.createdAt).toLocaleString('pt-BR')} • ${a.actorUser?.email ?? 'sistema'}`)} />
          </Panel>
        ) : null}
      </div>
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
