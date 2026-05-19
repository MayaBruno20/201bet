'use client';

import * as React from 'react';
import { I } from '@/components/ui/icons';
import { Page, Card, SectionTitle } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, apiFetch, getApiBaseUrl } from '@/lib/api';
import { ENDPOINTS } from '@/lib/endpoints';
import { FinancialClosingPanel } from '@/components/admin/financial-closing-panel';

type ClosingEligibleEvent = {
  id: string;
  name: string;
  source: 'list' | 'armageddon';
  scheduledAt: string;
  endsAt: string | null;
  status: string;
  contextName: string | null;
};

/**
 * Relatórios usa o endpoint de export do backend pra baixar JSON ou CSV.
 * Não há gráficos prontos no backend ainda; isso vira "Em breve".
 */
export default function RelatoriosPage() {
  const [busy, setBusy] = React.useState<string | null>(null);
  const { push } = useToast();

  async function exportData(type: 'users' | 'events' | 'bets' | 'transactions', format: 'json' | 'csv') {
    setBusy(`${type}-${format}`);
    try {
      const res = await apiFetch(ENDPOINTS.ANALYTICS.export(type, format));
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      push({ title: 'Exportação iniciada', body: `${type}.${format}`, tone: 'emerald' });
    } catch (e) {
      push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' });
    } finally { setBusy(null); }
  }

  return (
    <Page eyebrow="Análise" title="Relatórios"
      sub={`Exportações de dados em JSON ou CSV. Base: ${getApiBaseUrl()}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {([
          { type: 'bets', title: 'Apostas', desc: 'Todas as apostas com stake, retorno potencial, status, data.', icon: 'Receipt' as const, tone: '#3ee093' },
          { type: 'events', title: 'Eventos', desc: 'Eventos cadastrados — Copa Categorias, Listas, Armageddon.', icon: 'Trophy' as const, tone: 'var(--accent)' },
          { type: 'users', title: 'Usuários', desc: 'Apostadores e equipe administrativa.', icon: 'Users' as const, tone: '#7cd0ff' },
          { type: 'transactions', title: 'Transações', desc: 'Movimentações de carteira (depósitos, saques, apostas, ajustes).', icon: 'Wallet' as const, tone: '#a78bfa' },
        ] as const).map((r) => {
          const Ico = I[r.icon];
          return (
            <Card key={r.type} className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-[12px] grid place-items-center shrink-0" style={{ background: 'var(--surface-2)', color: r.tone }}>
                  <Ico size={20}/>
                </div>
                <div className="flex-1">
                  <div className="font-display text-[16px] font-bold">{r.title}</div>
                  <div className="text-[12px] text-[color:var(--text-3)] mt-1">{r.desc}</div>
                  <div className="flex gap-2 mt-3">
                    <button className="btn btn-ghost" onClick={() => exportData(r.type, 'csv')} disabled={!!busy}>
                      <I.Download size={13}/> {busy === `${r.type}-csv` ? 'Exportando…' : 'CSV'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => exportData(r.type, 'json')} disabled={!!busy}>
                      <I.Download size={13}/> {busy === `${r.type}-json` ? 'Exportando…' : 'JSON'}
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-8">
        <EventClosingSection />
      </div>

      <Card className="p-8 text-center mt-6">
        <div className="w-12 h-12 rounded-[12px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)' }}>
          <I.Chart size={20} style={{ color: 'var(--text-3)' }}/>
        </div>
        <div className="font-display text-[15px] font-semibold mt-3">Gráficos e análises</div>
        <div className="text-[12.5px] text-[color:var(--text-3)] mt-1 max-w-md mx-auto">
          Receita por mês, GGR, distribuição por modalidade, tendências — em breve.
          Por enquanto, exporte os dados acima e abra no Excel/BI.
        </div>
      </Card>
    </Page>
  );
}

function EventClosingSection() {
  const [events, setEvents] = React.useState<ClosingEligibleEvent[]>([]);
  const [selectedId, setSelectedId] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const { push } = useToast();

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await api.get<ClosingEligibleEvent[]>(ENDPOINTS.ANALYTICS.closingEligibleEvents);
        if (alive) setEvents(list);
      } catch (e) {
        if (alive) push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [push]);

  const selected = events.find((e) => e.id === selectedId) ?? null;

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
        <SectionTitle
          title="Evento"
          sub="Fechamento financeiro detalhado por evento (Listas e Armageddon). Selecione um para ver totais e exportar."
        />
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <label className="text-[11px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">
            Selecione o evento
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={loading || events.length === 0}
            className="flex-1 min-w-[280px] h-9 rounded-[10px] px-3 text-[13px] font-medium"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="">
              {loading ? 'Carregando eventos…' : events.length === 0 ? 'Nenhum evento disponível' : '— escolha um evento —'}
            </option>
            {events.map((e) => {
              const label = `${e.source === 'list' ? '🏁' : '⚔️'} ${e.name}${e.contextName ? ` · ${e.contextName}` : ''} · ${new Date(e.scheduledAt).toLocaleDateString('pt-BR')}`;
              return (
                <option key={`${e.source}-${e.id}`} value={e.id}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {selected ? (
        <FinancialClosingPanel eventId={selected.id} source={selected.source} />
      ) : (
        <div className="p-10 text-center text-[13px] text-[color:var(--text-3)]">
          {loading ? 'Carregando…' : 'Escolha um evento acima para ver o fechamento e exportar.'}
        </div>
      )}
    </Card>
  );
}
