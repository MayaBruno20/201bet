// Camada de dados do painel admin.
//
// As constantes (NAV, KPIS, REVENUE, …) ainda são mocks e servem como FALLBACK
// caso a API esteja fora ou demore. As funções `fetch*` chamam o backend real
// e mapeiam a resposta pra forma que as pages esperam. Se a chamada falhar,
// retornam o mock (UI nunca quebra por erro de rede).
//
// Quando precisar adicionar/remover campos, mantenha os types acima alinhados.

import { api } from './api';
import { ENDPOINTS } from './endpoints';

export type NavItem = { id: string; label: string; icon: string; group: string; href: string; badge?: string };
export type Kpi = { id: string; label: string; value: string; delta: number; sub: string; tone: string; spark: number[] };
export type RevenuePoint = { m: string; receita: number; apostas: number; ggr: number };
export type EventTypeSlice = { name: string; value: number; color: string };
export type LiveEvent = { id: number; name: string; cat: string; status: string; bets: number; total: number; ledger: string; region: string };
export type Pilot = {
  id: number;
  /** ID real (UUID) do recurso no backend — `Driver.id` em pilotos, `User.id` em usuários. */
  realId?: string;
  name: string;
  tag: string;
  vehicle: string;
  cat: string;
  wins: number;
  points: number;
  status: string;
  region: string;
  avatar: string;
  /** Apenas pilotos: marca convidados criados por embate rápido. */
  isGuest?: boolean;
};
export type Bet = { id: number; user: string; userTag: string; event: string; pilot: string; amount: number; odd: number; potential: number; status: string; date: string; method: string };
export type ListItem = { id?: string; ddd: string; name: string; tier: string; pilots: number; status: string; sede: string; updated: string };
export type Activity = { who: string; what: string; target: string; when: string; tone: string };
export type AuditEntry = { id: number; actor: string; actorRole: string; action: string; target: string; targetType: string; ip: string; when: string; severity: string };

export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'Dashboard', group: 'Visão', href: '/dashboard' },
  { id: 'eventos', label: 'Copa Categorias', icon: 'Trophy', group: 'Operação', href: '/eventos' },
  { id: 'listas', label: 'Listas Brasil', icon: 'Layers', group: 'Operação', href: '/listas' },
  { id: 'armageddon', label: 'Armageddon', icon: 'Flame', group: 'Operação', href: '/armageddon' },
  { id: 'embates-rapidos', label: 'Embates rápidos', icon: 'Bolt', group: 'Operação', href: '/embates-rapidos' },
  { id: 'market-control', label: 'Mercados ao vivo', icon: 'Bolt', group: 'Operação', href: '/market-control' },
  { id: 'pilotos', label: 'Pilotos', icon: 'Users', group: 'Cadastros', href: '/pilotos' },
  { id: 'carros', label: 'Carros', icon: 'Bolt', group: 'Cadastros', href: '/carros' },
  { id: 'usuarios', label: 'Usuários', icon: 'Users', group: 'Cadastros', href: '/usuarios' },
  { id: 'financeiro', label: 'Financeiro', icon: 'Wallet', group: 'Financeiro', href: '/financeiro' },
  { id: 'apostas', label: 'Apostas', icon: 'Receipt', group: 'Financeiro', href: '/apostas' },
  { id: 'analytics', label: 'Relatórios', icon: 'Chart', group: 'Análise', href: '/relatorios' },
  { id: 'auditoria', label: 'Auditoria', icon: 'Shield', group: 'Análise', href: '/auditoria' },
  { id: 'disclaimers', label: 'Disclaimers', icon: 'AlertTriangle', group: 'Sistema', href: '/disclaimers' },
  { id: 'seguranca', label: 'Segurança', icon: 'Shield', group: 'Sistema', href: '/seguranca' },
];

export const KPIS: Kpi[] = [
  { id: 'usuarios', label: 'Usuários', value: '8.432', delta: -2.1, sub: '892 online agora', tone: 'violet', spark: [44,52,49,55,60,58,62,57,55,53] },
  { id: 'apostas', label: 'Apostas Ativas', value: '1.247', delta: 8.2, sub: '490 hoje', tone: 'sky', spark: [12,18,17,24,28,30,35,33,40,46] },
  { id: 'eventos', label: 'Eventos Ativos', value: '23', delta: 18.0, sub: '3 ao vivo', tone: 'amber', spark: [6,8,7,10,12,11,14,16,18,21] },
  { id: 'receita', label: 'Receita 30d', value: 'R$ 152.340', delta: 12.5, sub: 'GGR R$ 38.4k', tone: 'emerald', spark: [22,28,30,38,42,49,55,52,60,67] },
  { id: 'mercados', label: 'Mercados Abertos', value: '128', delta: 4.3, sub: '0 com risco', tone: 'sky', spark: [80,90,95,100,110,120,118,125,128,128] },
  { id: 'pendentes', label: 'Pagamentos Pendentes', value: '55', delta: -6.0, sub: 'R$ 8.560,00', tone: 'rose', spark: [70,68,62,60,58,55,50,52,55,55] },
];

export const REVENUE: RevenuePoint[] = [
  { m: 'Jan', receita: 45, apostas: 32, ggr: 9 },
  { m: 'Fev', receita: 52, apostas: 38, ggr: 11 },
  { m: 'Mar', receita: 48, apostas: 35, ggr: 10 },
  { m: 'Abr', receita: 61, apostas: 45, ggr: 14 },
  { m: 'Mai', receita: 55, apostas: 40, ggr: 12 },
  { m: 'Jun', receita: 67, apostas: 49, ggr: 17 },
  { m: 'Jul', receita: 71, apostas: 53, ggr: 19 },
  { m: 'Ago', receita: 65, apostas: 47, ggr: 16 },
];

export const EVENT_TYPES: EventTypeSlice[] = [
  { name: 'Lista Brasil', value: 45, color: '#ffb028' },
  { name: 'Copa Categorias', value: 30, color: '#21d97a' },
  { name: 'Armageddon', value: 18, color: '#ff5a6c' },
  { name: 'Personalizados', value: 7, color: '#a78bfa' },
];

export const LIVE_EVENTS: LiveEvent[] = [
  { id: 1, name: '2º Festival do Opala', cat: 'TUDOKIDÁ · 11 categorias', status: 'AO VIVO', bets: 234, total: 12450, ledger: 'R$ 730,27', region: 'Brasil' },
  { id: 2, name: 'Copa Categorias SP', cat: '9s', status: 'ENCERRADO', bets: 189, total: 9870, ledger: 'R$ 412,00', region: 'SP' },
  { id: 3, name: 'Arrancada Nordeste', cat: 'Original 10s', status: 'AGENDADO', bets: 67, total: 3210, ledger: '—', region: 'NE' },
  { id: 4, name: 'Armageddon Sul · 8s', cat: '8s', status: 'AGENDADO', bets: 21, total: 980, ledger: '—', region: 'Sul' },
];

export const PILOTS: Pilot[] = [
  { id: 1, name: 'Adair Adir da Silva', tag: '#001', vehicle: 'Opala SS', cat: 'Original 10s', wins: 15, points: 1250, status: 'Ativo', region: 'DDD 012', avatar: 'AS' },
  { id: 5, name: 'Allan Douglas Radulski', tag: '#005', vehicle: 'Fusca', cat: '9s', wins: 12, points: 1100, status: 'Ativo', region: 'DDD 015', avatar: 'AR' },
  { id: 7, name: 'André Ramo', tag: '#007', vehicle: 'Chevette', cat: '8,5s', wins: 18, points: 1450, status: 'Ativo', region: 'DDD 021', avatar: 'AR' },
  { id: 15, name: 'Artur Luiz Boaventura', tag: '#015', vehicle: 'Maverick', cat: 'TUDOKIDÁ', wins: 22, points: 1680, status: 'Ativo', region: 'DDD 012', avatar: 'AB' },
  { id: 31, name: 'Denise Barreto Fortes', tag: '#031', vehicle: 'Opala 4cc', cat: '7,5s', wins: 9, points: 980, status: 'Ativo', region: 'DDD 045', avatar: 'DF' },
  { id: 45, name: 'Elton José Cavalli', tag: '#045', vehicle: 'Camaro', cat: '6s', wins: 6, points: 720, status: 'Ativo', region: 'DDD 062', avatar: 'EC' },
  { id: 50, name: 'Fernando Freitas', tag: '#050', vehicle: 'Corcel', cat: '9s', wins: 8, points: 890, status: 'Inativo', region: 'DDD 015', avatar: 'FF' },
  { id: 66, name: 'Guilherme Peterson Manoel', tag: '#066', vehicle: 'Opala SS', cat: '8s', wins: 14, points: 1320, status: 'Ativo', region: 'DDD 048', avatar: 'GM' },
  { id: 84, name: 'Juliano Rodrigues de Souza', tag: '#084', vehicle: 'Fusca', cat: '7s', wins: 11, points: 1080, status: 'Ativo', region: 'DDD 021', avatar: 'JS' },
  { id: 99, name: 'Luiz Vanderlei Fernandes', tag: '#099', vehicle: 'Maverick', cat: '6,5s', wins: 17, points: 1410, status: 'Ativo', region: 'DDD 071', avatar: 'LF' },
];

export const BETS: Bet[] = [
  { id: 1, user: 'João Silva', userTag: 'JS', event: '2º Festival do Opala', pilot: 'Adair Adir da Silva', amount: 250.0, odd: 2.5, potential: 625.0, status: 'Pendente', date: 'há 2min', method: 'Vencedor' },
  { id: 2, user: 'Maria Santos', userTag: 'MS', event: 'Copa Categorias SP', pilot: 'Jorge Francisco', amount: 500.0, odd: 1.8, potential: 900.0, status: 'Ganhou', date: 'há 12min', method: 'Reação' },
  { id: 3, user: 'Pedro Costa', userTag: 'PC', event: 'Arrancada Nordeste', pilot: 'Allan Douglas', amount: 150.0, odd: 3.2, potential: 480.0, status: 'Perdeu', date: 'há 25min', method: 'Vencedor' },
  { id: 4, user: 'Ana Oliveira', userTag: 'AO', event: '2º Festival do Opala', pilot: 'Slaicon China', amount: 300.0, odd: 4.0, potential: 1200.0, status: 'Pendente', date: 'há 30min', method: 'Queimada' },
  { id: 5, user: 'Carlos Mendes', userTag: 'CM', event: 'Copa Categorias SP', pilot: 'André Ramo', amount: 1000.0, odd: 1.5, potential: 1500.0, status: 'Ganhou', date: 'há 1h', method: 'Vencedor' },
  { id: 6, user: 'Rafaela Souza', userTag: 'RS', event: 'Armageddon Sul', pilot: 'Guilherme Peterson', amount: 80.0, odd: 5.5, potential: 440.0, status: 'Pendente', date: 'há 1h', method: 'Vencedor' },
  { id: 7, user: 'Tiago Borges', userTag: 'TB', event: '2º Festival do Opala', pilot: 'Denise Fortes', amount: 200.0, odd: 2.1, potential: 420.0, status: 'Cancelada', date: 'há 2h', method: 'Reação' },
];

export const LISTS: ListItem[] = [
  { ddd: '12', name: 'Lista Área 12', tier: 'TOP 10', pilots: 10, status: 'ATIVA', sede: 'Taubaté', updated: 'há 3 dias' },
  { ddd: '15', name: 'Lista Área 15', tier: 'TOP 20', pilots: 20, status: 'ATIVA', sede: 'Sorocaba', updated: 'há 1 dia' },
  { ddd: '16', name: 'Lista Área 16', tier: 'TOP 10', pilots: 10, status: 'ATIVA', sede: 'Ribeirão', updated: 'há 5 dias' },
  { ddd: '18', name: 'Lista Área 18', tier: 'TOP 20', pilots: 17, status: 'ATIVA', sede: 'Pres. Prudente', updated: 'hoje' },
  { ddd: '21', name: 'Lista Área 21', tier: 'TOP 10', pilots: 10, status: 'ATIVA', sede: 'Rio de Janeiro', updated: 'há 2 dias' },
  { ddd: '31', name: 'Lista Área 31', tier: 'TOP 10', pilots: 10, status: 'ATIVA', sede: 'BH', updated: 'há 7 dias' },
  { ddd: '43', name: 'Lista Área 43', tier: 'TOP 20', pilots: 20, status: 'ATIVA', sede: 'Porto Alegre', updated: 'há 4 dias' },
  { ddd: '44', name: 'Lista Área 44', tier: 'TOP 20', pilots: 20, status: 'ATIVA', sede: 'Maringá', updated: 'há 3 dias' },
  { ddd: '47', name: 'Lista Área 47', tier: 'TOP 20', pilots: 20, status: 'ATIVA', sede: 'Joinville', updated: 'hoje' },
  { ddd: '48', name: 'Lista Área 48', tier: 'TOP 20', pilots: 20, status: 'PAUSADA', sede: 'Florianópolis', updated: 'há 14 dias' },
];

export const ACTIVITY: Activity[] = [
  { who: 'admin@201bet.com', what: 'aprovou saque', target: 'Maria Santos · R$ 900,00', when: 'há 4min', tone: 'emerald' },
  { who: 'sistema', what: 'evento iniciado', target: '2º Festival do Opala · 9s', when: 'há 12min', tone: 'amber' },
  { who: 'admin@201bet.com', what: 'editou regulamento', target: 'Armageddon SP · 8s', when: 'há 38min', tone: 'sky' },
  { who: 'sistema', what: 'piloto inscrito', target: 'Marlon Patrick · TUDOKIDÁ', when: 'há 1h', tone: 'violet' },
  { who: 'admin@201bet.com', what: 'criou lista', target: 'Lista Área 47 · TOP 20', when: 'há 2h', tone: 'amber' },
];

export const AUDIT: AuditEntry[] = [
  { id: 1, actor: 'admin@201bet.com', actorRole: 'Super Admin', action: 'aprovou saque', target: 'Maria Santos · R$ 900,00', targetType: 'Pagamento', ip: '189.40.21.5', when: '2026-05-08 14:32', severity: 'info' },
  { id: 2, actor: 'op-rj@201bet.com', actorRole: 'Operador', action: 'editou odd', target: 'Mercado Vencedor · 2º Opala', targetType: 'Mercado', ip: '177.12.88.110', when: '2026-05-08 14:18', severity: 'warn' },
  { id: 3, actor: 'sistema', actorRole: 'Sistema', action: 'liquidou apostas', target: 'Copa SP · 24 apostas', targetType: 'Lote', ip: '—', when: '2026-05-08 13:55', severity: 'info' },
  { id: 4, actor: 'admin@201bet.com', actorRole: 'Super Admin', action: 'cancelou aposta', target: 'Tiago Borges · R$ 200,00', targetType: 'Aposta', ip: '189.40.21.5', when: '2026-05-08 13:40', severity: 'warn' },
  { id: 5, actor: 'op-sp@201bet.com', actorRole: 'Operador', action: 'criou lista', target: 'Lista Área 47 · TOP 20', targetType: 'Lista', ip: '201.99.12.4', when: '2026-05-08 12:10', severity: 'info' },
  { id: 6, actor: 'admin@201bet.com', actorRole: 'Super Admin', action: 'desativou piloto', target: 'Fernando Freitas #050', targetType: 'Piloto', ip: '189.40.21.5', when: '2026-05-08 11:22', severity: 'warn' },
  { id: 7, actor: 'sistema', actorRole: 'Sistema', action: 'falha de pagamento', target: 'PIX gateway · timeout', targetType: 'Sistema', ip: '—', when: '2026-05-08 10:48', severity: 'error' },
  { id: 8, actor: 'op-ne@201bet.com', actorRole: 'Operador', action: 'iniciou evento', target: 'Arrancada Nordeste', targetType: 'Evento', ip: '187.55.4.99', when: '2026-05-08 10:00', severity: 'info' },
];

/* ─── Tipos do backend (forma real) ─── */

type BackendUser = {
  id: string;
  email: string;
  name: string;
  cpf?: string | null;
  birthDate?: string | null;
  role: 'USER' | 'ADMIN' | 'OPERATOR' | 'AUDITOR';
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  emailVerified: boolean;
  wallet?: { balance: number | string; currency: string } | null;
};

type BackendDriver = {
  id: string;
  name: string;
  nickname?: string | null;
  team?: string | null;
  carNumber?: string | null;
  hometown?: string | null;
  active: boolean;
  isGuest?: boolean;
};

type BackendDashboard = {
  totalUsers?: number;
  activeUsers?: number;
  totalEvents?: number;
  eventsTotal?: number;
  liveEvents?: number;
  openMarkets?: number;
  pendingPayments?: number;
  pendingPaymentsAmount?: number;
  totalRevenue?: number;
  ggr?: number;
  totalBets?: number;
  betsToday?: number;
  riskMarkets?: number;
  rangeDays?: number;
  revenueByMonth?: Array<{ month: string; receita: number; apostas: number; ggr: number }>;
  eventTypeDistribution?: Array<{ tipo: string; total: number }>;
};

type BackendBet = {
  id: string;
  userEmail?: string;
  user?: { name?: string | null; email?: string };
  stake: number;
  potentialWin: number;
  status: string;
  createdAt: string;
  marketName?: string;
  oddAtPlacement?: number;
};

type BackendListItem = {
  id: string;
  areaCode: number;
  name: string;
  format: 'TOP_10' | 'TOP_20';
  active?: boolean;
  hometown?: string | null;
  rosterCount?: number;
  updatedAt?: string;
};

type BackendAuditLog = {
  id: string;
  actorUserId?: string | null;
  /** Backend serializa via include `actorUser` (não `actor`). */
  actorUser?: { id?: string; email?: string; name?: string; role?: string } | null;
  action: string;
  entity: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  payload?: unknown;
  createdAt: string;
};

/* ─── Helpers de mapeamento backend → forma esperada pela UI ─── */

function fmtBRL(v: number | string | undefined | null): string {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  if (!Number.isFinite(n)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return iso;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '??';
}

/* ─── Fetchers ─── */

/** Dashboard agregado: KPIs principais. Em erro, devolve zeros (não mock). */
export async function fetchKpis(days = 30): Promise<Kpi[]> {
  const d = await api.get<BackendDashboard>(ENDPOINTS.DASHBOARD.summaryFor(days));
  const totalEvents = d.totalEvents ?? d.eventsTotal ?? 0;
  return [
    { id: 'usuarios', label: 'Usuários', value: String(d.totalUsers ?? 0), delta: 0, sub: `${d.activeUsers ?? 0} ativos`, tone: 'violet', spark: KPIS[0].spark },
    { id: 'apostas', label: 'Apostas Totais', value: String(d.totalBets ?? 0), delta: 0, sub: `${d.betsToday ?? 0} hoje`, tone: 'sky', spark: KPIS[1].spark },
    { id: 'eventos', label: 'Eventos', value: String(totalEvents), delta: 0, sub: `${d.liveEvents ?? 0} ao vivo`, tone: 'amber', spark: KPIS[2].spark },
    { id: 'receita', label: `Receita ${days}d`, value: fmtBRL(d.totalRevenue ?? 0), delta: 0, sub: `GGR ${fmtBRL(d.ggr ?? 0)}`, tone: 'emerald', spark: KPIS[3].spark },
    { id: 'mercados', label: 'Mercados Abertos', value: String(d.openMarkets ?? 0), delta: 0, sub: `${d.riskMarkets ?? 0} com risco`, tone: 'sky', spark: KPIS[4].spark },
    { id: 'pendentes', label: 'Pagamentos Pendentes', value: String(d.pendingPayments ?? 0), delta: 0, sub: fmtBRL(d.pendingPaymentsAmount ?? 0), tone: 'rose', spark: KPIS[5].spark },
  ];
}

const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

/** Receita por mês — vem do dashboard summary. Vazio se sem dados. */
export async function fetchRevenue(days = 30): Promise<RevenuePoint[]> {
  const d = await api.get<BackendDashboard>(ENDPOINTS.DASHBOARD.summaryFor(days));
  const items = d.revenueByMonth ?? [];
  return items.map((r) => ({
    m: MONTH_NAMES[Number((r.month ?? '').slice(5, 7)) - 1] ?? r.month,
    receita: Number(r.receita ?? 0) / 1000, // gráfico em milhares
    apostas: Number(r.apostas ?? 0),
    ggr: Math.max(0, Number(r.receita ?? 0) - Number(r.ggr ?? 0)) / 1000,
  }));
}

/** Distribuição por tipo de evento — agregado pelo backend. */
export async function fetchEventTypes(days = 30): Promise<EventTypeSlice[]> {
  const d = await api.get<BackendDashboard>(ENDPOINTS.DASHBOARD.summaryFor(days));
  const items = d.eventTypeDistribution ?? [];
  const palette: Record<string, string> = {
    ListEvent: '#ffb028',
    CategoryEvent: '#21d97a',
    ArmageddonEvent: '#ff5a6c',
    Event: '#a78bfa',
  };
  const labels: Record<string, string> = {
    ListEvent: 'Listas Brasil',
    CategoryEvent: 'Copa Categorias',
    ArmageddonEvent: 'Armageddon',
    Event: 'Outros',
  };
  return items.filter((i) => Number(i.total) > 0).map((i) => ({
    name: labels[i.tipo] ?? i.tipo,
    value: Number(i.total),
    color: palette[i.tipo] ?? '#a78bfa',
  }));
}

/* ─── Mercados (admin/markets) ─── */

export type MarketRow = {
  id: string;
  eventId: string;
  eventName: string;
  name: string;
  type: string;
  status: 'OPEN' | 'CLOSED' | 'SUSPENDED' | 'SETTLED';
  rakePercent: number | null;
  bookingCloseAt: string | null;
  duelId: string | null;
  winnerOddId: string | null;
  totalPool: number;
  odds: Array<{ id: string; label: string; value: number; status: string }>;
};

type BackendMarket = {
  id: string; eventId: string; name: string; type: string; status: MarketRow['status'];
  rakePercent?: string | number | null; bookingCloseAt?: string | null;
  duelId?: string | null; winnerOddId?: string | null;
  event: { name: string };
  duel?: { poolState?: { leftPool?: string | number; rightPool?: string | number } | null } | null;
  odds: Array<{ id: string; label: string; value: string | number; status: string }>;
};

/** Lista todos os mercados (admin). */
export async function fetchMarkets(): Promise<MarketRow[]> {
  try {
    const list = await api.get<BackendMarket[]>(ENDPOINTS.MARKETS.list);
    return list.map((m) => {
      const left = Number(m.duel?.poolState?.leftPool ?? 0);
      const right = Number(m.duel?.poolState?.rightPool ?? 0);
      return {
        id: m.id,
        eventId: m.eventId,
        eventName: m.event?.name ?? '—',
        name: m.name,
        type: m.type,
        status: m.status,
        rakePercent: m.rakePercent != null ? Number(m.rakePercent) : null,
        bookingCloseAt: m.bookingCloseAt ?? null,
        duelId: m.duelId ?? null,
        winnerOddId: m.winnerOddId ?? null,
        totalPool: left + right,
        odds: m.odds.map((o) => ({ id: o.id, label: o.label, value: Number(o.value), status: o.status })),
      };
    });
  } catch { return []; }
}

/** Eventos vivos — usa o admin/events real, filtrando ativos. */
export async function fetchLiveEvents(): Promise<LiveEvent[]> {
  type BackendEvent = {
    id: string; name: string; status: string;
    startAt: string; sport: string;
    _count?: { bets?: number; markets?: number };
    totalPool?: number;
  };
  const list = await api.get<BackendEvent[]>(ENDPOINTS.EVENTS.list);
  return list.slice(0, 20).map((e, i) => ({
    id: i + 1,
    name: e.name,
    cat: e.sport ?? '—',
    status: e.status === 'LIVE' ? 'AO VIVO' : e.status === 'FINISHED' ? 'ENCERRADO' : 'AGENDADO',
    bets: e._count?.bets ?? 0,
    total: e.totalPool ?? 0,
    ledger: e.totalPool ? fmtBRL(e.totalPool * 0.06) : '—',
    region: 'Brasil',
  }));
}

/** Pilotos cadastrados (drivers no backend). */
export async function fetchPilots(): Promise<Pilot[]> {
  try {
    const list = await api.get<BackendDriver[]>(ENDPOINTS.DRIVERS.list);
    return list.map((d, i) => ({
      id: i + 1,
      realId: d.id,
      name: d.name,
      tag: d.carNumber ? `#${d.carNumber}` : `#${String(i + 1).padStart(3, '0')}`,
      vehicle: d.team ?? '—',
      cat: '—',
      wins: 0,
      points: 0,
      status: d.active ? 'Ativo' : 'Inativo',
      region: d.team ?? '—',
      avatar: initials(d.name),
      isGuest: !!d.isGuest,
    }));
  } catch { return PILOTS; }
}

/** Usuários (apostadores). Mapeia BackendUser → forma usada na tabela atual. */
export async function fetchUsers(): Promise<Pilot[]> {
  try {
    const list = await api.get<BackendUser[]>(ENDPOINTS.USERS.list);
    return list.map((u, i) => ({
      id: i + 1,
      realId: u.id,
      name: u.name,
      tag: u.email,
      vehicle: u.role,
      cat: u.role,
      wins: 0,
      points: Number(u.wallet?.balance ?? 0),
      status: u.status === 'ACTIVE' ? 'Ativo' : 'Inativo',
      region: u.cpf ? `CPF ${u.cpf}` : '—',
      avatar: initials(u.name),
    }));
  } catch { return PILOTS; }
}

/** Apostas — backend não expõe lista paginada de TODAS bets ainda; mock fica ativo. */
export async function fetchBets(): Promise<Bet[]> {
  try {
    // Tentativa: endpoint de analytics export pode dar JSON com bets.
    type ExportResp = { data: BackendBet[] };
    const resp = await api.get<ExportResp>(ENDPOINTS.ANALYTICS.export('bets', 'json'));
    const items = Array.isArray(resp?.data) ? resp.data : [];
    return items.slice(0, 50).map((b, i) => ({
      id: i + 1,
      user: b.user?.name ?? b.userEmail ?? b.user?.email ?? '—',
      userTag: initials(b.user?.name ?? b.userEmail ?? '??'),
      event: b.marketName ?? '—',
      pilot: '—',
      amount: Number(b.stake),
      odd: Number(b.oddAtPlacement ?? 0),
      potential: Number(b.potentialWin),
      status: b.status === 'WON' ? 'Ganhou' : b.status === 'LOST' ? 'Perdeu' : b.status === 'REFUNDED' ? 'Cancelada' : 'Pendente',
      date: ago(b.createdAt),
      method: 'Vencedor',
    }));
  } catch { return BETS; }
}

/** Listas Brasil. */
export async function fetchLists(): Promise<ListItem[]> {
  try {
    const list = await api.get<BackendListItem[]>(ENDPOINTS.BRAZIL_LISTS.list);
    return list.map((l) => ({
      id: l.id,
      ddd: String(l.areaCode).padStart(2, '0'),
      name: l.name,
      tier: l.format === 'TOP_10' ? 'TOP 10' : 'TOP 20',
      pilots: l.rosterCount ?? 0,
      status: l.active === false ? 'PAUSADA' : 'ATIVA',
      sede: l.hometown ?? '—',
      updated: l.updatedAt ? ago(l.updatedAt) : '—',
    }));
  } catch { return LISTS; }
}

/** Atividade recente (deriva de audit logs). */
export async function fetchActivity(): Promise<Activity[]> {
  const logs = await api.get<BackendAuditLog[]>(ENDPOINTS.AUDIT.list);
  return logs.slice(0, 10).map((l) => ({
    who: l.actorUser?.email ?? l.actorUserId ?? 'sistema',
    what: humanizeAction(l.action),
    target: `${l.entity}${l.entityId ? ` ${l.entityId.slice(0, 8)}` : ''}`,
    when: ago(l.createdAt),
    tone: severityTone(l.action),
  }));
}

/** Audit log com filtros opcionais. Lança erro se a chamada falhar — sem fallback mock. */
export async function fetchAuditLog(opts: { hours?: number; entity?: string; limit?: number } = {}): Promise<AuditEntry[]> {
  const params = new URLSearchParams();
  if (opts.hours) {
    params.set('since', new Date(Date.now() - opts.hours * 3600_000).toISOString());
  }
  if (opts.entity) params.set('entity', opts.entity);
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  const url = `${ENDPOINTS.AUDIT.list}${qs ? `?${qs}` : ''}`;
  const logs = await api.get<BackendAuditLog[]>(url);
  return logs.map((l, i) => ({
    id: i + 1,
    actor: l.actorUser?.email ?? l.actorUserId ?? 'sistema',
    actorRole: l.actorUser?.role ?? 'Sistema',
    action: humanizeAction(l.action),
    target: `${l.entity}${l.entityId ? ` · ${l.entityId.slice(0, 8)}` : ''}`,
    targetType: l.entity,
    ip: l.ipAddress ?? '—',
    when: new Date(l.createdAt).toLocaleString('pt-BR'),
    severity:
      l.action.includes('FAIL') || l.action.includes('CRITICAL') || l.action.includes('REJECT') ? 'error'
      : l.action.includes('CANCEL') || l.action.includes('VOID') || l.action.includes('DEACTIVATE') || l.action.includes('LOGOUT') ? 'warn'
      : 'info',
  }));
}

function humanizeAction(action: string): string {
  return action
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/admin/gi, '')
    .replace(/^\s+/, '');
}

function severityTone(action: string): string {
  if (action.includes('FAIL') || action.includes('CRITICAL')) return 'rose';
  if (action.includes('CANCEL') || action.includes('VOID') || action.includes('SETTLE')) return 'amber';
  if (action.includes('CREATE') || action.includes('APPROVE')) return 'emerald';
  return 'sky';
}
