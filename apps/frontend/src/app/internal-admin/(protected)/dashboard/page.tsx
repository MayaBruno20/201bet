'use client';

import * as React from 'react';
import Link from 'next/link';
import { I, type IconName } from '@admin/components/ui/icons';
import { Page, Card, SectionTitle, Sparkline, Donut, AreaChart, StatusChip, Money } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import {
  fetchKpis,
  fetchRevenue,
  fetchEventTypes,
  fetchLiveEvents,
  fetchActivity,
  type Kpi,
  type RevenuePoint,
  type EventTypeSlice,
  type LiveEvent,
  type Activity,
} from '@admin/lib/data';

const KpiCard: React.FC<{ kpi: Kpi }> = ({ kpi }) => {
  const colorMap: Record<string, string> = { amber: 'var(--accent)', emerald: '#3ee093', rose: '#ff7585', sky: '#7cd0ff', violet: '#a78bfa' };
  const color = colorMap[kpi.tone] || 'var(--accent)';
  const up = kpi.delta >= 0;
  return (
    <Card className="p-5 flex flex-col gap-3 relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full opacity-[0.06]" style={{ background: color }}/>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">{kpi.label}</div>
        <span className="chip" style={{ background: up ? 'var(--emerald-soft)' : 'var(--rose-soft)', color: up ? '#3ee093' : '#ff7585' }}>
          {up ? <I.TrendUp size={12}/> : <I.TrendDown size={12}/>} {up ? '+' : ''}{kpi.delta}%
        </span>
      </div>
      <div className="font-display text-[28px] font-bold leading-none tracking-tight">{kpi.value}</div>
      <div className="text-[12px] text-[color:var(--text-3)]">{kpi.sub}</div>
      <div className="-mx-1 -mb-1"><Sparkline data={kpi.spark} color={color} height={32}/></div>
    </Card>
  );
};

const PERIOD_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 7, label: 'Últimos 7 dias' },
  { days: 30, label: 'Últimos 30 dias' },
  { days: 90, label: 'Últimos 90 dias' },
  { days: 365, label: 'Últimos 12 meses' },
];

export default function DashboardPage() {
  const { push } = useToast();
  const [kpis, setKpis] = React.useState<Kpi[]>([]);
  const [revenue, setRevenue] = React.useState<RevenuePoint[]>([]);
  const [eventTypes, setEventTypes] = React.useState<EventTypeSlice[]>([]);
  const [liveEvents, setLiveEvents] = React.useState<LiveEvent[]>([]);
  const [activity, setActivity] = React.useState<Activity[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [days, setDays] = React.useState(30);
  const [periodOpen, setPeriodOpen] = React.useState(false);
  const periodRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!periodOpen) return;
    const onClick = (e: MouseEvent) => {
      if (periodRef.current && !periodRef.current.contains(e.target as Node)) {
        setPeriodOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [periodOpen]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const settled = await Promise.allSettled([
        fetchKpis(days),
        fetchRevenue(days),
        fetchEventTypes(days),
        fetchLiveEvents(),
        fetchActivity(),
      ]);
      if (!alive) return;
      if (settled[0].status === 'fulfilled') setKpis(settled[0].value);
      if (settled[1].status === 'fulfilled') setRevenue(settled[1].value);
      if (settled[2].status === 'fulfilled') setEventTypes(settled[2].value);
      if (settled[3].status === 'fulfilled') setLiveEvents(settled[3].value);
      if (settled[4].status === 'fulfilled') setActivity(settled[4].value);
      const failed = settled.filter((s) => s.status === 'rejected');
      if (failed.length > 0) {
        push({ title: 'Falha ao carregar dashboard', body: `${failed.length} consulta(s) falharam`, tone: 'rose' });
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [push, days]);

  const eventsTotal = eventTypes.reduce((s, e) => s + e.value, 0);
  const periodLabel = PERIOD_OPTIONS.find((p) => p.days === days)?.label ?? `Últimos ${days} dias`;

  return (
    <Page eyebrow="Painel administrativo" title="Visão geral"
      sub="Gestão completa, segura e auditável da operação 201bet — apostas, eventos, pilotos e financeiro em tempo real."
      actions={<>
        <button className="btn btn-ghost focusable"><I.Download size={15}/> Exportar</button>
        <div ref={periodRef} className="relative">
          <button
            type="button"
            className="btn btn-ghost focusable"
            onClick={() => setPeriodOpen((v) => !v)}
          >
            <I.Calendar size={15}/> {periodLabel} <I.ChevronDown size={14}/>
          </button>
          {periodOpen && (
            <div
              className="absolute right-0 mt-2 z-50 surface-elev p-1.5 min-w-[180px]"
              style={{ borderRadius: 12 }}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-[8px] text-[13px] flex items-center justify-between hover:bg-[color:var(--surface-2)]"
                  onClick={() => { setDays(opt.days); setPeriodOpen(false); }}
                >
                  <span>{opt.label}</span>
                  {opt.days === days && <I.Check size={14} style={{ color: 'var(--accent)' }}/>}
                </button>
              ))}
            </div>
          )}
        </div>
      </>}>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {loading && kpis.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-5 h-[148px] flex items-center justify-center">
                <span className="text-[12px] text-[color:var(--text-3)]">Carregando…</span>
              </Card>
            ))
          : kpis.map((k) => <KpiCard key={k.id} kpi={k}/>)}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-6">
        <Card className="xl:col-span-2 p-5">
          <SectionTitle title="Receita & Apostas" sub="Volume mensal em milhares de R$"
            action={<div className="flex items-center gap-3 text-[12px] text-[color:var(--text-2)]">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#ffb028' }}/> Receita</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#a78bfa' }}/> Apostas</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: '#3ee093' }}/> GGR</span>
            </div>}/>
          {revenue.length > 0 ? (
            <AreaChart data={revenue as unknown as Record<string, number | string>[]} keys={['receita','apostas','ggr']} colors={['#ffb028','#a78bfa','#3ee093']} height={260}/>
          ) : (
            <div className="h-[260px] grid place-items-center text-[12.5px] text-[color:var(--text-3)]">
              {loading ? 'Carregando…' : 'Sem dados de apostas no período.'}
            </div>
          )}
        </Card>

        <Card className="p-5 flex flex-col">
          <SectionTitle title="Eventos por tipo" sub="Distribuição últimos 30 dias"/>
          {eventTypes.length > 0 ? (
            <div className="flex items-center gap-5 my-2">
              <div className="relative">
                <Donut data={eventTypes} size={140} thickness={20}/>
                <div className="absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <div className="font-display text-[22px] font-bold">{eventsTotal}</div>
                    <div className="text-[10.5px] text-[color:var(--text-3)] tracking-widest uppercase">eventos</div>
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-2.5">
                {eventTypes.map((t) => (
                  <div key={t.name} className="flex items-center gap-2 text-[13px]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }}/>
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="font-semibold tabular-nums">{t.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[140px] grid place-items-center text-[12.5px] text-[color:var(--text-3)]">
              {loading ? 'Carregando…' : 'Nenhum evento cadastrado.'}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2 p-0 overflow-hidden">
          <div className="flex items-center justify-between p-5">
            <SectionTitle title="Eventos recentes" sub="Operação ao vivo e agendados"/>
            <Link href="/eventos" className="btn btn-ghost focusable">Ver todos <I.ChevronRight size={14}/></Link>
          </div>
          <div className="divider"/>
          <table>
            <thead>
              <tr>
                <th style={{ paddingLeft: 20 }}>Evento</th>
                <th>Categoria</th>
                <th>Status</th>
                <th className="text-right">Apostas</th>
                <th className="text-right" style={{ paddingRight: 20 }}>Volume</th>
              </tr>
            </thead>
            <tbody>
              {liveEvents.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-[12.5px] text-[color:var(--text-3)]" style={{ paddingLeft: 20 }}>
                  {loading ? 'Carregando…' : 'Nenhum evento ativo.'}
                </td></tr>
              )}
              {liveEvents.map((e) => (
                <tr key={e.id} className="cursor-pointer">
                  <td style={{ paddingLeft: 20 }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-[10px] grid place-items-center" style={{ background: 'var(--surface-2)' }}>
                        <I.Trophy size={16} style={{ color: 'var(--accent)' }}/>
                      </div>
                      <div>
                        <div className="font-semibold text-[13.5px]">{e.name}</div>
                        <div className="text-[11.5px] text-[color:var(--text-3)]">{e.region}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-[color:var(--text-2)]">{e.cat}</td>
                  <td><StatusChip status={e.status}/></td>
                  <td className="text-right tabular-nums font-medium">{e.bets}</td>
                  <td className="text-right tabular-nums font-semibold" style={{ paddingRight: 20 }}><Money value={e.total}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Atividade recente" sub="Últimas operações administrativas"/>
          <div className="space-y-3.5">
            {activity.length === 0 && (
              <div className="text-[12.5px] text-[color:var(--text-3)] py-2">
                {loading ? 'Carregando…' : 'Sem atividade recente.'}
              </div>
            )}
            {activity.map((a, i) => {
              const cm: Record<string, string> = { amber: 'var(--accent)', emerald: '#3ee093', rose: '#ff7585', sky: '#7cd0ff', violet: '#a78bfa' };
              return (
                <div key={i} className="flex gap-3">
                  <div className="relative">
                    <div className="w-2 h-2 rounded-full mt-1.5" style={{ background: cm[a.tone] }}/>
                    {i !== activity.length - 1 && <div className="absolute top-3.5 left-[3px] bottom-[-12px] w-px" style={{ background: 'var(--border)' }}/>}
                  </div>
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="text-[12.5px]">
                      <span className="font-semibold">{a.who}</span>{' '}
                      <span className="text-[color:var(--text-3)]">{a.what}</span>{' '}
                      <span className="font-medium">{a.target}</span>
                    </div>
                    <div className="text-[11px] text-[color:var(--text-4)] mt-0.5">{a.when}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mt-7">
        <SectionTitle title="Acessos rápidos" sub="Áreas frequentes do painel"/>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[
            { id: 'usuarios', label: 'Cadastro de usuário', desc: 'CRUD de contas, roles e ajuste de saldo.', icon: 'Users', href: '/usuarios' },
            { id: 'pilotos', label: 'Cadastro de piloto', desc: 'CRUD completo de pilotos.', icon: 'Trophy', href: '/pilotos' },
            { id: 'mercados', label: 'Mercados ao vivo', desc: 'Pausar, fechar e ajustar odds.', icon: 'Bolt', href: '/market-control' },
            { id: 'relatorios', label: 'Lucro & Dashboard', desc: 'Lucro por mercado e resumo financeiro.', icon: 'Chart', href: '/relatorios' },
            { id: 'auditoria', label: 'Auditoria', desc: 'Rastro completo de operações.', icon: 'Shield', href: '/auditoria' },
            { id: 'seguranca', label: 'Segurança', desc: 'Sessões, 2FA e tokens API.', icon: 'Shield', href: '/seguranca' },
            { id: 'listas', label: 'Listas Brasil', desc: 'TOP 10 / TOP 20 por DDD.', icon: 'Layers', href: '/listas' },
            { id: 'personalizados', label: 'Eventos personalizados', desc: 'Construa eventos sob medida.', icon: 'Sparkles', href: '/personalizados' },
          ].map((q) => {
            const Ico = (I[q.icon as IconName] as React.FC<{ size?: number; style?: React.CSSProperties }>) || I.Dashboard;
            return (
              <Link key={q.id} href={q.href} onClick={() => push({ title: q.label, body: 'Abrindo…', tone: 'amber' })}
                className="surface text-left p-4 transition-all hover:-translate-y-0.5 hover:border-[color:var(--border-strong)]"
                style={{ borderRadius: 'var(--radius)' }}>
                <div className="w-9 h-9 rounded-[10px] grid place-items-center mb-3" style={{ background: 'var(--surface-2)' }}>
                  <Ico size={17} style={{ color: 'var(--accent)' }}/>
                </div>
                <div className="font-semibold text-[13.5px]">{q.label}</div>
                <div className="text-[11.5px] text-[color:var(--text-3)] mt-1">{q.desc}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </Page>
  );
}
