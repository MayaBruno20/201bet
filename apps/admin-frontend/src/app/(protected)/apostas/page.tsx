'use client';

import * as React from 'react';
import { I } from '@/components/ui/icons';
import { Page, Card, StatusChip, Avatar } from '@/components/ui/primitives';
import { fetchBets, type Bet } from '@/lib/data';
import { PeriodFilter, PERIOD_OPTIONS, filterByPeriod, type PeriodHours } from '@/components/ui/period-filter';

export default function ApostasPage() {
  const [bets, setBets] = React.useState<Bet[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<'all'|'Pendente'|'Ganhou'|'Perdeu'|'Cancelada'>('all');
  const [q, setQ] = React.useState('');
  const [period, setPeriod] = React.useState<PeriodHours>(24);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const data = await fetchBets();
      if (alive) { setBets(data); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  // Filtragem client-side por período usando o campo `rawDate` (ISO) que o
  // backend retorna em fetchBets — fallback pra `date` quando não disponível.
  const periodFiltered = React.useMemo(
    () => filterByPeriod(bets, period, (b) => b.rawDate ?? b.date),
    [bets, period],
  );

  const filtered = periodFiltered.filter((b) =>
    (filter === 'all' || b.status === filter) &&
    (!q || (b.user + b.event + b.pilot).toLowerCase().includes(q.toLowerCase()))
  );

  // KPIs derivados das bets do período selecionado.
  const kpis = React.useMemo(() => {
    const volume = periodFiltered.reduce((s, b) => s + b.amount, 0);
    const pendentes = periodFiltered.filter((b) => b.status === 'Pendente');
    const ganhou = periodFiltered.filter((b) => b.status === 'Ganhou');
    const cancelaram = periodFiltered.filter((b) => b.status === 'Cancelada');
    return [
      { l: 'Volume', v: 'R$ ' + (volume / 1000).toFixed(1) + 'k', d: periodFiltered.length + ' apostas', tone: '#3ee093' },
      { l: 'Pendentes', v: pendentes.length, d: 'R$ ' + pendentes.reduce((s, b) => s + b.amount, 0).toFixed(0), tone: 'var(--accent)' },
      { l: 'Ganhou', v: ganhou.length, d: 'R$ ' + ganhou.reduce((s, b) => s + b.potential, 0).toFixed(0), tone: '#7cd0ff' },
      { l: 'Reembolsos', v: cancelaram.length, d: periodFiltered.length ? ((cancelaram.length / periodFiltered.length) * 100).toFixed(1) + '%' : '0%', tone: '#ff7585' },
    ] as const;
  }, [periodFiltered]);

  const fmt = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',');
  const periodShort = PERIOD_OPTIONS.find((o) => o.hours === period)?.short ?? 'Hoje';

  return (
    <Page eyebrow="Financeiro" title="Apostas & Saques"
      sub={`Liquidação, cancelamentos e auditoria de transações. Mostrando: ${periodShort}.`}
      actions={<>
        <PeriodFilter value={period} onChange={setPeriod}/>
        <button className="btn btn-ghost focusable"><I.Download size={15}/> Exportar CSV</button>
        <button className="btn btn-primary focusable"><I.Wallet size={15}/> Liquidar lote</button>
      </>}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {kpis.map((m) => (
          <Card key={m.l} className="p-4">
            <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">{m.l}</div>
            <div className="font-display text-[24px] font-bold mt-1" style={{ color: m.tone }}>{m.v}</div>
            <div className="text-[11px] text-[color:var(--text-3)] mt-0.5">{m.d}</div>
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center gap-3 p-4 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1 relative min-w-[260px]">
            <I.Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-3)' }}/>
            <input className="input pl-9" placeholder="Buscar usuário, evento, piloto…" value={q} onChange={(e) => setQ(e.target.value)}/>
          </div>
          <div className="flex items-center gap-1 surface-2 rounded-[12px] p-1">
            {(['all','Pendente','Ganhou','Perdeu','Cancelada'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-3 py-1.5 text-[12.5px] font-semibold rounded-[8px]"
                style={{ background: filter === f ? 'var(--surface-3)' : 'transparent', color: filter === f ? 'var(--text)' : 'var(--text-3)' }}>
                {f === 'all' ? 'Todas' : f}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Carregando apostas…</div>}
        {!loading && filtered.length === 0 && <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">Nenhuma aposta encontrada.</div>}

        {!loading && filtered.length > 0 && (
          <table>
            <thead>
              <tr><th style={{ paddingLeft: 20 }}>Usuário</th><th>Evento</th><th>Mercado</th><th className="text-right">Valor</th><th className="text-right">Odd</th><th className="text-right">Potencial</th><th>Status</th><th style={{ paddingRight: 20 }}>Quando</th></tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => (
                <tr key={b.id}>
                  <td style={{ paddingLeft: 20 }}>
                    <div className="flex items-center gap-3">
                      <Avatar initials={b.userTag} size={30} tone={['amber','sky','violet','emerald','rose'][i % 5]}/>
                      <div className="font-semibold text-[13px]">{b.user}</div>
                    </div>
                  </td>
                  <td className="text-[color:var(--text-2)]">{b.event}</td>
                  <td>
                    <div className="text-[12.5px] font-semibold">{b.pilot}</div>
                    <div className="text-[11px] text-[color:var(--text-3)]">{b.method}</div>
                  </td>
                  <td className="text-right tabular-nums font-mono font-semibold">{fmt(b.amount)}</td>
                  <td className="text-right tabular-nums font-mono" style={{ color: '#7cd0ff' }}>{b.odd.toFixed(2)}x</td>
                  <td className="text-right tabular-nums font-mono font-semibold" style={{ color: '#3ee093' }}>{fmt(b.potential)}</td>
                  <td><StatusChip status={b.status}/></td>
                  <td style={{ paddingRight: 20 }} className="text-[11.5px] text-[color:var(--text-3)]">{b.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </Page>
  );
}
