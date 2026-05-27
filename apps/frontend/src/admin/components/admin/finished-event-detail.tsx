'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Card, StatusChip } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { api } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';

type MatchupWithPool = {
  id: string;
  roundNumber: number;
  roundType: 'ODD' | 'EVEN' | 'SHARK_TANK';
  order: number;
  leftPosition: number | null;
  rightPosition: number | null;
  leftDriver?: { id: string; name: string } | null;
  rightDriver?: { id: string; name: string } | null;
  winnerSide: 'LEFT' | 'RIGHT' | null;
  settledAt: string | null;
  notes: string | null;
  pool: {
    leftPool: number;
    rightPool: number;
    totalPool: number;
    leftPercent: number;
    rightPercent: number;
    leftTickets: number;
    rightTickets: number;
  };
};

type EventDetail = {
  id: string;
  name: string;
  scheduledAt: string;
  endsAt: string | null;
  status: 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELED';
  type: 'REGULAR' | 'ARMAGEDDON' | 'SHARK_TANK';
  notes: string | null;
  totalPool: number;
  list: { id: string; name: string; format: 'TOP_10' | 'TOP_20'; areaCode: number };
  matchups: MatchupWithPool[];
};

const ROUND_LABEL: Record<MatchupWithPool['roundType'], string> = {
  ODD: 'Rodada ÍMPAR',
  EVEN: 'Rodada PAR',
  SHARK_TANK: 'Shark Tank',
};

const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

export function FinishedEventDetail({
  eventId,
  onClose,
}: {
  eventId: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = React.useState<EventDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { push } = useToast();

  React.useEffect(() => {
    setLoading(true);
    api
      .get<EventDetail>(ENDPOINTS.BRAZIL_LISTS.events.detail(eventId))
      .then((data) => setDetail(data))
      .catch((e) =>
        push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }),
      )
      .finally(() => setLoading(false));
  }, [eventId, push]);

  if (loading || !detail) {
    return (
      <div
        className="fixed inset-0 z-[150] cmdk-overlay flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="surface-elev p-6 text-[13px] text-[color:var(--text-3)]">Carregando…</div>
      </div>
    );
  }

  // Agrupa matchups por rodada
  const byRound = new Map<number, MatchupWithPool[]>();
  for (const m of detail.matchups) {
    const arr = byRound.get(m.roundNumber) ?? [];
    arr.push(m);
    byRound.set(m.roundNumber, arr);
  }
  const rounds = [...byRound.entries()].sort((a, b) => a[0] - b[0]);

  const settledCount = detail.matchups.filter((m) => m.winnerSide).length;
  const totalDuels = detail.matchups.length;

  return (
    <div
      className="fixed inset-0 z-[150] cmdk-overlay overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="min-h-full flex items-start justify-center p-4 py-10">
        <div className="surface-elev w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="p-5 flex items-start gap-4 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
            <div
              className="w-12 h-12 rounded-[14px] grid place-items-center shrink-0"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              <I.Trophy size={20} />
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">
                Evento encerrado · {detail.list.name} · {detail.list.format} · DDD {detail.list.areaCode}
              </div>
              <div className="font-display text-[22px] font-bold leading-tight mt-0.5">{detail.name}</div>
              <div className="flex items-center gap-2 mt-2 text-[12px] text-[color:var(--text-3)] flex-wrap">
                <StatusChip status="ENCERRADO" />
                <span>{new Date(detail.scheduledAt).toLocaleString('pt-BR')}</span>
                {detail.endsAt && <span>— {new Date(detail.endsAt).toLocaleString('pt-BR')}</span>}
              </div>
            </div>
            <button className="btn btn-ghost focusable" onClick={onClose}>
              <I.X size={14} /> Fechar
            </button>
          </div>

          {/* Resumo Financeiro */}
          <div className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="surface-2 p-4">
                <div className="text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--text-3)] font-semibold">
                  Pot total
                </div>
                <div className="font-display text-[22px] font-bold mt-1 tabular-nums" style={{ color: 'var(--accent)' }}>
                  {fmtBRL(detail.totalPool)}
                </div>
              </div>
              <div className="surface-2 p-4">
                <div className="text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--text-3)] font-semibold">
                  Passadas
                </div>
                <div className="font-display text-[22px] font-bold mt-1 tabular-nums">{totalDuels}</div>
              </div>
              <div className="surface-2 p-4">
                <div className="text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--text-3)] font-semibold">
                  Auditadas
                </div>
                <div className="font-display text-[22px] font-bold mt-1 tabular-nums" style={{ color: 'var(--emerald)' }}>
                  {settledCount}/{totalDuels}
                </div>
              </div>
              <div className="surface-2 p-4">
                <div className="text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--text-3)] font-semibold">
                  Rodadas
                </div>
                <div className="font-display text-[22px] font-bold mt-1 tabular-nums">{rounds.length}</div>
              </div>
            </div>
          </div>

          {/* Passadas por rodada */}
          <div className="p-5">
            {rounds.length === 0 ? (
              <Card className="p-12 text-center text-[13px] text-[color:var(--text-3)]">
                Nenhuma passada registrada neste evento.
              </Card>
            ) : (
              <div className="space-y-6">
                {rounds.map(([roundNumber, matchups]) => {
                  const sorted = [...matchups].sort((a, b) => a.order - b.order);
                  const roundPool = sorted.reduce((s, m) => s + m.pool.totalPool, 0);
                  return (
                    <div key={roundNumber}>
                      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="font-display text-[14px] font-bold">Rodada {roundNumber}</div>
                          <span className="chip" style={{ background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                            {ROUND_LABEL[sorted[0].roundType]}
                          </span>
                          <span className="text-[11.5px] text-[color:var(--text-3)]">{sorted.length} passadas</span>
                        </div>
                        <div className="text-[11.5px] text-[color:var(--text-3)]">
                          Pot da rodada:{' '}
                          <span className="font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                            {fmtBRL(roundPool)}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {sorted.map((m) => (
                          <PassadaCard key={m.id} matchup={m} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PassadaCard({ matchup: m }: { matchup: MatchupWithPool }) {
  const leftWon = m.winnerSide === 'LEFT';
  const rightWon = m.winnerSide === 'RIGHT';
  const noBets = m.pool.totalPool === 0;
  const leftPct = Math.round(m.pool.leftPercent);
  const rightPct = Math.round(m.pool.rightPercent);

  return (
    <div className="surface-2 p-4" style={{ borderRadius: 12 }}>
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] shrink-0">
          #{m.order}
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex items-center gap-2 justify-end text-right" style={{ opacity: rightWon ? 0.4 : 1 }}>
            <div className="min-w-0">
              <div className="font-semibold text-[13.5px] truncate">{m.leftDriver?.name ?? 'A definir'}</div>
              {m.leftPosition && (
                <div className="text-[10.5px] text-[color:var(--text-3)]">Posição {m.leftPosition}º</div>
              )}
            </div>
            {leftWon && (
              <span
                className="chip shrink-0"
                style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}
              >
                <I.Trophy size={10} /> VENCEU
              </span>
            )}
          </div>

          <div className="text-center px-3">
            <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase" style={{ color: 'var(--text-3)' }}>
              VS
            </div>
          </div>

          <div className="flex items-center gap-2 text-left" style={{ opacity: leftWon ? 0.4 : 1 }}>
            {rightWon && (
              <span
                className="chip shrink-0"
                style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}
              >
                <I.Trophy size={10} /> VENCEU
              </span>
            )}
            <div className="min-w-0">
              <div className="font-semibold text-[13.5px] truncate">{m.rightDriver?.name ?? 'A definir'}</div>
              {m.rightPosition && (
                <div className="text-[10.5px] text-[color:var(--text-3)]">Posição {m.rightPosition}º</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Distribuição do pot — barra dupla */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[10.5px] tabular-nums">
          <span style={{ color: leftWon ? 'var(--emerald)' : 'var(--text-2)' }}>
            {fmtBRL(m.pool.leftPool)} <span className="text-[color:var(--text-3)]">· {leftPct}%</span>
          </span>
          <span className="text-[color:var(--text-3)] font-semibold uppercase tracking-[0.12em]">
            Pot {fmtBRL(m.pool.totalPool)}
          </span>
          <span style={{ color: rightWon ? 'var(--emerald)' : 'var(--text-2)' }}>
            <span className="text-[color:var(--text-3)]">{rightPct}% ·</span> {fmtBRL(m.pool.rightPool)}
          </span>
        </div>
        {!noBets ? (
          <div
            className="relative h-2 rounded-full overflow-hidden"
            style={{ background: 'var(--surface-3)' }}
          >
            <div
              className="absolute inset-y-0 left-0 transition-all"
              style={{
                width: `${leftPct}%`,
                background: leftWon
                  ? 'linear-gradient(90deg, var(--emerald), var(--emerald-2, var(--emerald)))'
                  : 'var(--accent)',
                opacity: leftWon ? 1 : 0.55,
              }}
            />
            <div
              className="absolute inset-y-0 right-0 transition-all"
              style={{
                width: `${rightPct}%`,
                background: rightWon
                  ? 'linear-gradient(270deg, var(--emerald), var(--emerald-2, var(--emerald)))'
                  : 'var(--rose)',
                opacity: rightWon ? 1 : 0.55,
              }}
            />
          </div>
        ) : (
          <div className="text-[10.5px] text-[color:var(--text-3)] italic">
            Nenhuma aposta registrada nesta passada.
          </div>
        )}
        {!noBets && (
          <div className="flex justify-between text-[10px] text-[color:var(--text-3)] tabular-nums">
            <span>{m.pool.leftTickets} tickets</span>
            <span>{m.pool.rightTickets} tickets</span>
          </div>
        )}
      </div>

      {m.settledAt && (
        <div className="text-[10.5px] text-[color:var(--text-3)] mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          Auditada em {new Date(m.settledAt).toLocaleString('pt-BR')}
          {m.notes && ` · ${m.notes}`}
        </div>
      )}
    </div>
  );
}
