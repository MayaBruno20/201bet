'use client';

import * as React from 'react';
import { I } from '@/components/ui/icons';
import { Page, Card } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { fetchAuditLog, type AuditEntry } from '@/lib/data';

const POLL_MS = 10_000;

const TONE: Record<string, { bg: string; fg: string; label: string }> = {
  info: { bg: 'rgba(124,208,255,0.15)', fg: '#7cd0ff', label: 'INFO' },
  warn: { bg: 'var(--accent-soft)', fg: 'var(--accent)', label: 'AVISO' },
  error: { bg: 'var(--rose-soft)', fg: '#ff7585', label: 'ERRO' },
};

const RANGE_OPTIONS = [
  { id: 24, label: 'Últimas 24h' },
  { id: 24 * 7, label: 'Últimos 7 dias' },
  { id: 24 * 30, label: 'Últimos 30 dias' },
  { id: 0, label: 'Tudo (até 500)' },
] as const;

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function downloadCsv(rows: AuditEntry[]) {
  const headers = ['quando', 'ator', 'role', 'acao', 'tipo_alvo', 'alvo', 'ip', 'severidade'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.when,
      r.actor,
      r.actorRole,
      r.action,
      r.targetType,
      r.target,
      r.ip,
      r.severity,
    ].map(csvEscape).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AuditoriaPage() {
  const { push } = useToast();
  const [entries, setEntries] = React.useState<AuditEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [hours, setHours] = React.useState<number>(24 * 7); // default: 7 dias
  const [sev, setSev] = React.useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [q, setQ] = React.useState('');
  const [lastUpdate, setLastUpdate] = React.useState<Date>(new Date());

  const load = React.useCallback(async () => {
    try {
      const data = await fetchAuditLog({ hours: hours || undefined, limit: 500 });
      setEntries(data);
      setError(null);
      setLastUpdate(new Date());
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao carregar logs';
      setError(msg);
      push({ title: 'Erro ao carregar auditoria', body: msg, tone: 'rose' });
    } finally { setLoading(false); }
  }, [hours, push]);

  React.useEffect(() => {
    setLoading(true);
    void load();
    const i = setInterval(load, POLL_MS);
    return () => clearInterval(i);
  }, [load]);

  const filtered = React.useMemo(() => entries.filter((a) => {
    if (sev !== 'all' && a.severity !== sev) return false;
    if (q && !(a.actor + a.action + a.target + a.targetType).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [entries, sev, q]);

  const counts = React.useMemo(() => {
    const c = { all: entries.length, info: 0, warn: 0, error: 0 };
    for (const e of entries) c[e.severity as 'info' | 'warn' | 'error'] += 1;
    return c;
  }, [entries]);

  const rangeLabel = RANGE_OPTIONS.find((r) => r.id === hours)?.label ?? `${hours}h`;

  return (
    <Page eyebrow="Análise" title="Auditoria"
      sub="Registro completo e imutável de ações no painel."
      actions={
        <>
          <span className="text-[11.5px] text-[color:var(--text-3)] flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: 'var(--emerald)' }}/>
            {lastUpdate.toLocaleTimeString('pt-BR')}
          </span>
          <select className="input" style={{ width: 180 }} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {RANGE_OPTIONS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          <button className="btn btn-primary focusable" onClick={() => downloadCsv(filtered)} disabled={filtered.length === 0}>
            <I.Download size={15}/> Exportar log ({filtered.length})
          </button>
        </>
      }>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Total', value: counts.all, fg: 'var(--text)' },
          { label: 'INFO', value: counts.info, fg: '#7cd0ff' },
          { label: 'AVISOS', value: counts.warn, fg: 'var(--accent)' },
          { label: 'ERROS', value: counts.error, fg: '#ff7585' },
        ].map((m) => (
          <Card key={m.label} className="p-4">
            <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">{m.label}</div>
            <div className="font-display text-[24px] font-bold mt-1 tabular-nums" style={{ color: m.fg }}>{m.value}</div>
            <div className="text-[10.5px] text-[color:var(--text-4)] mt-0.5">{rangeLabel.toLowerCase()}</div>
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex items-center gap-3 p-4 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1 relative min-w-[260px]">
            <I.Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-3)' }}/>
            <input className="input pl-9" placeholder="Buscar ator, ação, entidade…" value={q} onChange={(e) => setQ(e.target.value)}/>
          </div>
          <div className="flex items-center gap-1 surface-2 rounded-[12px] p-1">
            {(['all', 'info', 'warn', 'error'] as const).map((s) => (
              <button key={s} onClick={() => setSev(s)}
                className="px-3 py-1.5 text-[12px] font-semibold rounded-[8px]"
                style={{ background: sev === s ? 'var(--surface-3)' : 'transparent', color: sev === s ? 'var(--text)' : 'var(--text-3)' }}>
                {s === 'all' ? `Todos (${counts.all})` : `${TONE[s].label} (${counts[s as 'info' | 'warn' | 'error']})`}
              </button>
            ))}
          </div>
        </div>

        {loading && entries.length === 0 && (
          <div className="p-12 text-center text-[13px] text-[color:var(--text-3)]">Carregando logs…</div>
        )}

        {error && entries.length === 0 && (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-[12px] grid place-items-center mx-auto" style={{ background: 'var(--rose-soft)', color: 'var(--rose)' }}>
              <I.AlertTriangle size={20}/>
            </div>
            <div className="font-display text-[15px] font-semibold mt-3">Não foi possível carregar a auditoria</div>
            <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">{error}</div>
            <button className="btn btn-primary mt-4" onClick={() => { setLoading(true); void load(); }}>
              <I.Activity size={14}/> Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && entries.length === 0 && (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-[12px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
              <I.Shield size={20}/>
            </div>
            <div className="font-display text-[15px] font-semibold mt-3">Nenhum evento auditado</div>
            <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">Nada nas {rangeLabel.toLowerCase()}. Aumente a janela acima ou registre alguma ação no painel.</div>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && entries.length > 0 && (
          <div className="p-8 text-center text-[12.5px] text-[color:var(--text-3)]">
            Nenhum log bate com os filtros. Limpe a busca ou troque a severidade.
          </div>
        )}

        {filtered.length > 0 && (
          <div>
            {filtered.map((a) => (
              <div key={a.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-[color:var(--surface)]" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="w-9 h-9 rounded-[10px] grid place-items-center shrink-0" style={{ background: TONE[a.severity].bg, color: TONE[a.severity].fg }}>
                  <I.Shield size={14}/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[12px] font-semibold">{a.actor}</span>
                    <span className="chip" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>{a.actorRole}</span>
                    <span className="text-[12.5px] text-[color:var(--text-2)]">{a.action}</span>
                    <span className="text-[12.5px] font-semibold">{a.target}</span>
                    <span className="chip" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>{a.targetType}</span>
                  </div>
                  <div className="text-[11px] text-[color:var(--text-3)] mt-1 font-mono">{a.when} · IP {a.ip}</div>
                </div>
                <span className="chip" style={{ background: TONE[a.severity].bg, color: TONE[a.severity].fg, fontWeight: 700, letterSpacing: '0.06em' }}>
                  {TONE[a.severity].label}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}
