'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Page, Card } from '@admin/components/ui/primitives';
import { AUDIT } from '@admin/lib/data';

export default function AuditoriaPage() {
  const [sev, setSev] = React.useState<'all'|'info'|'warn'|'error'>('all');
  const [q, setQ] = React.useState('');
  const filtered = AUDIT.filter((a) =>
    (sev === 'all' || a.severity === sev) &&
    (!q || (a.actor + a.action + a.target).toLowerCase().includes(q.toLowerCase()))
  );

  const tone: Record<string, { bg: string; fg: string; label: string }> = {
    info: { bg: 'rgba(124,208,255,0.15)', fg: '#7cd0ff', label: 'INFO' },
    warn: { bg: 'var(--amber-soft)', fg: 'var(--accent)', label: 'AVISO' },
    error: { bg: 'var(--rose-soft)', fg: '#ff7585', label: 'ERRO' },
  };

  return (
    <Page eyebrow="Análise" title="Auditoria"
      sub="Registro completo e imutável de ações no painel."
      actions={<>
        <button className="btn btn-ghost focusable"><I.Calendar size={15}/> Últimos 7 dias</button>
        <button className="btn btn-primary focusable"><I.Download size={15}/> Exportar log</button>
      </>}>
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center gap-3 p-4 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex-1 relative min-w-[260px]">
            <I.Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-3)' }}/>
            <input className="input pl-9" placeholder="Buscar ator, ação, alvo…" value={q} onChange={(e) => setQ(e.target.value)}/>
          </div>
          <div className="flex items-center gap-1 surface-2 rounded-[12px] p-1">
            {(['all','info','warn','error'] as const).map((s) => (
              <button key={s} onClick={() => setSev(s)}
                className="px-3 py-1.5 text-[12px] font-semibold rounded-[8px]"
                style={{ background: sev === s ? 'var(--surface-3)' : 'transparent', color: sev === s ? 'var(--text)' : 'var(--text-3)' }}>
                {s === 'all' ? 'Todos' : s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {filtered.map((a) => (
            <div key={a.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-[color:var(--surface)]" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="w-9 h-9 rounded-[10px] grid place-items-center shrink-0" style={{ background: tone[a.severity].bg, color: tone[a.severity].fg }}>
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
              <span className="chip" style={{ background: tone[a.severity].bg, color: tone[a.severity].fg, fontWeight: 700, letterSpacing: '0.06em' }}>{tone[a.severity].label}</span>
            </div>
          ))}
        </div>
      </Card>
    </Page>
  );
}
