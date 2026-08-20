'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Card } from '@admin/components/ui/primitives';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';
import { useToast } from '@admin/components/ui/toast';

type Resource = {
  resource: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastMessage: string | null;
  stats: Record<string, unknown> | null;
};
type Status = { running: boolean; configured: boolean; resources: Resource[] };

const LABEL: Record<string, string> = {
  'listas-brasil:pilots': 'Pilotos + listas',
  'listas-brasil:events': 'Eventos',
};

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function statNumbers(stats: Record<string, unknown> | null): string {
  if (!stats) return '';
  if ('rosterRows' in stats) return `${stats.pilots ?? 0} pilotos · ${stats.lists ?? 0} listas · ${stats.rosterRows ?? 0} no roster`;
  if ('upserted' in stats) return `${stats.upserted ?? 0} eventos sincronizados · ${stats.skipped ?? 0} pulados`;
  return '';
}

export function ListasBrasilSync() {
  const [status, setStatus] = React.useState<Status | null>(null);
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const loadStatus = React.useCallback(async () => {
    try {
      setStatus(await api.get<Status>(ENDPOINTS.INTEGRATIONS.listasBrasil.status));
    } catch { /* silencioso */ }
  }, []);

  React.useEffect(() => { void loadStatus(); }, [loadStatus]);

  // Enquanto estiver rodando, atualiza o status a cada 4s.
  React.useEffect(() => {
    if (!status?.running) return;
    const t = setInterval(() => void loadStatus(), 4000);
    return () => clearInterval(t);
  }, [status?.running, loadStatus]);

  const sync = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ started: boolean; message: string }>(ENDPOINTS.INTEGRATIONS.listasBrasil.sync, {});
      push({ title: r.started ? 'Sincronização iniciada' : 'Aviso', body: r.message, tone: r.started ? 'emerald' : 'amber' });
      await loadStatus();
    } catch (e) {
      push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' });
    } finally {
      setBusy(false);
    }
  };

  const running = status?.running;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <I.RotateCcw size={15} style={{ color: 'var(--accent)' }} />
            <span className="font-semibold text-[13.5px]">Sincronizar com Listas Brasil</span>
            {running && (
              <span className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700 }}>
                rodando…
              </span>
            )}
          </div>
          <p className="text-[11.5px] mt-1" style={{ color: 'var(--text-3)' }}>
            Puxa pilotos, listas (por área), posições e fotos da fonte oficial. Sobrescreve dados locais; upsert por UUID.
          </p>
        </div>
        <button className="btn btn-primary focusable" onClick={() => void sync()} disabled={busy || running || status?.configured === false}>
          <I.RotateCcw size={14} /> {running ? 'Sincronizando…' : 'Sincronizar agora'}
        </button>
      </div>

      {status?.configured === false && (
        <p className="text-[11.5px] mt-2" style={{ color: '#ffb028' }}>
          Chave <code>LISTAS_BRASIL_API_KEY</code> não configurada no ambiente.
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(status?.resources ?? []).map((r) => (
          <div key={r.resource} className="rounded-[10px] px-3 py-2" style={{ background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold">{LABEL[r.resource] ?? r.resource}</span>
              <span className="chip" style={{
                background: r.lastStatus === 'ok' ? 'var(--emerald-soft)' : r.lastStatus === 'error' ? 'rgba(255,90,108,0.14)' : 'var(--surface-3)',
                color: r.lastStatus === 'ok' ? 'var(--emerald)' : r.lastStatus === 'error' ? '#ff7585' : 'var(--text-3)',
                fontWeight: 700,
              }}>
                {r.lastStatus ?? '—'}
              </span>
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--text-3)' }}>{statNumbers(r.stats)}</div>
            <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-4)' }}>último: {fmtTime(r.lastRunAt)}</div>
            {r.lastStatus === 'error' && r.lastMessage && (
              <div className="text-[10.5px] mt-1" style={{ color: '#ff7585' }}>{r.lastMessage}</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
