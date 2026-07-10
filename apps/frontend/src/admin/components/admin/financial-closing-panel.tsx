'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Card, SectionTitle } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';

export type FinancialClosing = {
  eventId: string;
  eventName: string;
  source: 'list' | 'armageddon';
  window: { start: string; end: string; note: string };
  bets: {
    count: number;
    uniqueBettors: number;
    wonBets: number;
    lostBets: number;
    totalStaked: number;
    totalWinnings: number;
    totalRefunds: number;
    totalLosses: number;
    houseMargin: number;
  };
  payments: {
    totalDeposits: number;
    totalWithdrawals: number;
    netCashFlow: number;
  };
};

const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

function toCsv(d: FinancialClosing): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows: Array<[string, string]> = [
    ['Fechamento financeiro', ''],
    ['Evento', escape(d.eventName)],
    ['Origem', d.source === 'list' ? 'Lista Brasil' : 'Armageddon'],
    ['Janela início', new Date(d.window.start).toLocaleString('pt-BR')],
    ['Janela fim', new Date(d.window.end).toLocaleString('pt-BR')],
    ['', ''],
    ['Apostas', ''],
    ['Total apostado (R$)', d.bets.totalStaked.toFixed(2)],
    ['Ganhos pagos (R$)', d.bets.totalWinnings.toFixed(2)],
    ['Perdas dos apostadores (R$)', d.bets.totalLosses.toFixed(2)],
    ['Reembolsos (R$)', d.bets.totalRefunds.toFixed(2)],
    ['Margem da casa (R$)', d.bets.houseMargin.toFixed(2)],
    ['Apostas (total)', String(d.bets.count)],
    ['Vencedoras', String(d.bets.wonBets)],
    ['Perdedoras', String(d.bets.lostBets)],
    ['Apostadores únicos', String(d.bets.uniqueBettors)],
    ['', ''],
    ['Fluxo de caixa na janela', ''],
    ['Depósitos (R$)', d.payments.totalDeposits.toFixed(2)],
    ['Saques (R$)', d.payments.totalWithdrawals.toFixed(2)],
    ['Saldo líquido (R$)', d.payments.netCashFlow.toFixed(2)],
    ['', ''],
    ['Observação', escape(d.window.note)],
  ];
  return rows.map(([k, v]) => `${k},${v}`).join('\n');
}

function downloadCsv(d: FinancialClosing) {
  const blob = new Blob(['﻿' + toCsv(d)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fechamento-${d.source}-${d.eventName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function FinancialClosingPanel({ eventId, source }: { eventId: string; source: 'list' | 'armageddon' }) {
  const [data, setData] = React.useState<FinancialClosing | null>(null);
  const [loading, setLoading] = React.useState(false);
  const { push } = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const endpoint =
        source === 'list'
          ? ENDPOINTS.ANALYTICS.listEventFinancialClosing(eventId)
          : ENDPOINTS.ANALYTICS.armageddonEventFinancialClosing(eventId);
      setData(await api.get<FinancialClosing>(endpoint));
    } catch (e) {
      push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' });
    } finally {
      setLoading(false);
    }
  }, [eventId, source, push]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">
        Calculando fechamento…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-[13px] text-[color:var(--text-3)]">
        <button className="btn btn-ghost" onClick={() => void load()}>
          <I.Activity size={13}/> Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 space-y-5 financial-closing-print-root">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .financial-closing-print-root, .financial-closing-print-root * { visibility: visible; }
          .financial-closing-print-root { position: absolute; left: 0; top: 0; width: 100%; padding: 24px; color: #000; background: #fff; }
          .financial-closing-print-root .no-print { display: none !important; }
          .financial-closing-print-root .surface-2 { background: #fff !important; }
        }
      `}</style>

      <SectionTitle
        title="Fechamento financeiro"
        sub={`Resumo agregado de apostas, ganhos, perdas e fluxo de caixa do evento. Janela: ${new Date(data.window.start).toLocaleString('pt-BR')} → ${new Date(data.window.end).toLocaleString('pt-BR')}. ${data.window.note}`}
      />

      <div className="flex flex-wrap justify-end gap-2 no-print">
        <button className="btn btn-ghost" onClick={() => downloadCsv(data)}>
          <I.Download size={13}/> Exportar CSV
        </button>
        <button className="btn btn-ghost" onClick={() => window.print()}>
          <I.Save size={13}/> Imprimir / PDF
        </button>
        <button className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
          <I.Activity size={13}/> {loading ? 'Recalculando…' : 'Atualizar'}
        </button>
      </div>

      <div>
        <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)] mb-2">
          Apostas
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Total apostado" value={fmtBRL(data.bets.totalStaked)} tone="#7cd0ff" />
          <KPI label="Ganhos pagos" value={fmtBRL(data.bets.totalWinnings)} tone="#3ee093" />
          <KPI label="Perdas dos apostadores" value={fmtBRL(data.bets.totalLosses)} tone="#ff7585" />
          <KPI label="Margem da casa" value={fmtBRL(data.bets.houseMargin)} tone="#a78bfa" />
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI label="Reembolsos" value={fmtBRL(data.bets.totalRefunds)} tone="var(--accent)" />
          <KPI label="Apostas (total)" value={String(data.bets.count)} tone="var(--text)" />
          <KPI label="Vencedoras / Perdedoras" value={`${data.bets.wonBets} / ${data.bets.lostBets}`} tone="var(--text)" />
          <KPI label="Apostadores únicos" value={String(data.bets.uniqueBettors)} tone="var(--text)" />
        </div>
      </div>

      <div>
        <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)] mb-2">
          Fluxo de caixa na janela do evento (aproximação)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <KPI label="Depósitos" value={fmtBRL(data.payments.totalDeposits)} tone="#3ee093" />
          <KPI label="Saques" value={fmtBRL(data.payments.totalWithdrawals)} tone="#ff7585" />
          <KPI
            label="Saldo líquido"
            value={fmtBRL(data.payments.netCashFlow)}
            tone={data.payments.netCashFlow >= 0 ? '#3ee093' : '#ff7585'}
          />
        </div>
        <div className="mt-2 text-[10.5px] text-[color:var(--text-4)] leading-snug">
          Atenção: depósitos e saques não têm vínculo direto com o evento — são todos os pagamentos APROVADOS na janela
          temporal indicada acima. Outros eventos no mesmo período podem inflar esses números.
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card className="p-3">
      <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">
        {label}
      </div>
      <div className="font-display text-[18px] font-bold mt-1 tabular-nums" style={{ color: tone }}>
        {value}
      </div>
    </Card>
  );
}

export default FinancialClosingPanel;
