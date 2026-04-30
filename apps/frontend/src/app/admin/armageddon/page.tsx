'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { apiFetch } from '@/lib/api-request';
import { clearClientSession, getStoredUser, SessionUser, setStoredUser } from '@/lib/auth';
import { getPublicApiUrl } from '@/lib/env-public';
import { useConfirm } from '@/components/confirm-dialog';

const apiUrl = getPublicApiUrl();

type Roster = {
  id: string;
  position: number;
  isKing: boolean;
  driverId: string;
  driverName?: string | null;
  driverCarNumber?: string | null;
  driverTeam?: string | null;
  fromListId?: string | null;
  fromAreaCode?: number | null;
  fromPosition?: number | null;
};

type Matchup = {
  id: string;
  roundNumber: number;
  roundType: 'ODD' | 'EVEN' | 'SHARK_TANK';
  order: number;
  leftPosition: number | null;
  rightPosition: number | null;
  leftDriverId: string | null;
  rightDriverId: string | null;
  leftDriverName: string | null;
  rightDriverName: string | null;
  winnerSide: 'LEFT' | 'RIGHT' | null;
  marketOpen: boolean;
  duelId: string | null;
  settledAt: string | null;
};

type ArmageddonEvent = {
  id: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  featured: boolean;
  format: 'TOP_10' | 'TOP_20';
  scheduledAt: string;
  endsAt: string | null;
  status: 'DRAFT' | 'ROSTER_OPEN' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELED';
  notes: string | null;
  roster: Roster[];
  rosterCount: number;
  matchups: Matchup[];
  kingName: string | null;
};

type SourceList = {
  id: string;
  areaCode: number;
  name: string;
  format: 'TOP_10' | 'TOP_20';
  rosterCount: number;
  active: boolean;
  roster: Array<{ position: number; driverName: string }>;
};

const STATUS_LABEL: Record<ArmageddonEvent['status'], string> = {
  DRAFT: 'Rascunho',
  ROSTER_OPEN: 'Roster aberto',
  IN_PROGRESS: 'Em andamento',
  FINISHED: 'Encerrado',
  CANCELED: 'Cancelado',
};

export default function AdminArmageddonPage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [events, setEvents] = useState<ArmageddonEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ArmageddonEvent | null>(null);
  const [sourceLists, setSourceLists] = useState<SourceList[]>([]);
  const [tab, setTab] = useState<'roster' | 'chave' | 'importar'>('importar');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const [newEvent, setNewEvent] = useState({
    name: '',
    description: '',
    scheduledAt: '',
    endsAt: '',
    bannerUrl: '',
    featured: false,
    format: 'TOP_20' as 'TOP_10' | 'TOP_20',
  });

  // Selecoes para importar pilotos: { listId -> count }
  const [importSelections, setImportSelections] = useState<Record<string, number>>({});

  const confirm = useConfirm();
  const isAllowed = useMemo(() => sessionUser?.role === 'ADMIN', [sessionUser]);

  useEffect(() => { setSessionUser(getStoredUser()); }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch(`${apiUrl}/auth/me`, { cache: 'no-store' });
        if (!res.ok) { clearClientSession(); setSessionUser(null); return; }
        const me = (await res.json()) as SessionUser;
        setSessionUser(me); setStoredUser(me);
      } catch { setSessionUser(null); }
      finally { setSessionReady(true); }
    })();
  }, []);

  const adminJson = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await apiFetch(`${apiUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (response.status === 401 || response.status === 403) {
      clearClientSession(); setSessionUser(null);
      throw new Error('Sessão expirada ou sem permissão.');
    }
    if (!response.ok) {
      const raw = await response.text();
      let friendly = raw;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.message) && parsed.message[0]) friendly = parsed.message.join('; ');
        else if (typeof parsed?.message === 'string') friendly = parsed.message;
      } catch { /* */ }
      throw new Error(friendly);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminJson<ArmageddonEvent[]>('/admin/armageddon');
      setEvents(data);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Falha ao carregar');
    } finally { setLoading(false); }
  }, [adminJson]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const data = await adminJson<ArmageddonEvent>(`/admin/armageddon/${id}`);
      setDetail(data);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Falha ao carregar evento');
    } finally { setLoading(false); }
  }, [adminJson]);

  const loadSourceLists = useCallback(async () => {
    try {
      const data = await adminJson<SourceList[]>('/admin/brazil-lists');
      setSourceLists(data.filter((l) => l.active));
    } catch {
      // silencioso - pode nao ter permissao
    }
  }, [adminJson]);

  useEffect(() => {
    if (!sessionReady || !isAllowed) return;
    void loadEvents();
    void loadSourceLists();
  }, [sessionReady, isAllowed, loadEvents, loadSourceLists]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function submit(label: string, action: () => Promise<unknown>, reload: 'list' | 'detail' | 'both' = 'detail') {
    setLoading(true); setStatusMsg('');
    try {
      await action();
      if (reload === 'list' || reload === 'both') await loadEvents();
      if ((reload === 'detail' || reload === 'both') && selectedId) await loadDetail(selectedId);
      setStatusMsg(`${label}: sucesso.`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : `Falha em ${label}`);
    } finally { setLoading(false); }
  }

  if (!sessionReady) return <CenteredMsg msg='Carregando...' />;
  if (!isAllowed) return <CenteredMsg msg='Acesso negado. Apenas administradores.' danger />;

  const totalSelected = Object.values(importSelections).reduce((s, n) => s + n, 0);
  const maxPositions = detail?.format === 'TOP_10' ? 10 : 20;

  return (
    <main className='min-h-screen bg-[#090b11] text-white pb-10'>
      <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
        <MainNav />

        <section className='mt-2 rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-950/40 to-[#101525] p-4 sm:p-6'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='min-w-0 flex-1'>
              <p className='text-[10px] font-semibold uppercase tracking-widest text-rose-300/60'>Admin · Armageddon</p>
              <h1 className='mt-1 text-xl sm:text-2xl md:text-3xl font-bold tracking-tight'>💀 Armageddon</h1>
              <p className='mt-2 max-w-2xl text-xs text-white/60'>
                Evento nacional <strong>standalone</strong>. Importa pilotos das listas homologadas
                (item 70: até 50% do TOP por lista). Não afeta o ranking das listas de origem.
              </p>
            </div>
            <Link href='/admin' className='btn-outline'>← Voltar</Link>
          </div>
          {statusMsg && (
            <div className='mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80'>
              {statusMsg}
            </div>
          )}
        </section>

        <div className='mt-4 grid gap-4 lg:grid-cols-[320px_1fr]'>
          {/* Sidebar: events list + new event */}
          <aside className='rounded-2xl border border-white/10 bg-[#101525] p-4'>
            <h2 className='text-sm font-semibold tracking-wide text-white/80'>Edições do Armageddon</h2>
            <div className='mt-3 space-y-1.5 max-h-[280px] overflow-y-auto'>
              {events.length === 0 ? (
                <p className='text-xs text-white/40'>Nenhuma edição criada ainda.</p>
              ) : (
                events.map((e) => (
                  <button
                    key={e.id}
                    type='button'
                    onClick={() => setSelectedId(e.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                      selectedId === e.id
                        ? 'border-rose-500/50 bg-rose-500/10 text-rose-200'
                        : 'border-white/10 bg-white/[0.02] text-white/80 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className='flex items-center justify-between gap-2'>
                      <span className='truncate font-semibold'>{e.name}</span>
                      <span className='text-[9px] text-white/40'>{e.format}</span>
                    </div>
                    <div className='mt-1 flex items-center justify-between gap-2'>
                      <span className='text-[10px] text-white/50'>{new Date(e.scheduledAt).toLocaleDateString('pt-BR')}</span>
                      <span className={`text-[9px] font-semibold ${
                        e.status === 'IN_PROGRESS' ? 'text-emerald-300' : 'text-white/40'
                      }`}>{STATUS_LABEL[e.status]}</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className='mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3'>
              <h3 className='text-xs font-semibold uppercase tracking-wide text-white/60'>Nova edição</h3>
              <div className='mt-2 space-y-2'>
                <input
                  className='field-sm w-full'
                  placeholder='Nome (ex.: Armageddon 2026 — Etapa 1)'
                  value={newEvent.name}
                  onChange={(e) => setNewEvent((v) => ({ ...v, name: e.target.value }))}
                />
                <textarea
                  className='field-sm w-full'
                  placeholder='Descrição'
                  rows={2}
                  value={newEvent.description}
                  onChange={(e) => setNewEvent((v) => ({ ...v, description: e.target.value }))}
                />
                <div className='grid grid-cols-2 gap-2'>
                  <label className='text-[10px] text-white/50'>
                    Início
                    <input
                      type='datetime-local'
                      className='field-sm w-full mt-1'
                      value={newEvent.scheduledAt}
                      onChange={(e) => setNewEvent((v) => ({ ...v, scheduledAt: e.target.value }))}
                    />
                  </label>
                  <label className='text-[10px] text-white/50'>
                    Fim
                    <input
                      type='datetime-local'
                      className='field-sm w-full mt-1'
                      value={newEvent.endsAt}
                      onChange={(e) => setNewEvent((v) => ({ ...v, endsAt: e.target.value }))}
                    />
                  </label>
                </div>
                <select
                  className='field-sm w-full'
                  value={newEvent.format}
                  onChange={(e) => setNewEvent((v) => ({ ...v, format: e.target.value as 'TOP_10' | 'TOP_20' }))}
                >
                  <option value='TOP_20'>TOP 20</option>
                  <option value='TOP_10'>TOP 10</option>
                </select>
                <input
                  className='field-sm w-full'
                  placeholder='URL do banner (imagem ou vídeo Vimeo/YouTube)'
                  value={newEvent.bannerUrl}
                  onChange={(e) => setNewEvent((v) => ({ ...v, bannerUrl: e.target.value }))}
                />
                <label className='flex items-center gap-2 text-[11px] text-white/70'>
                  <input
                    type='checkbox'
                    checked={newEvent.featured}
                    onChange={(e) => setNewEvent((v) => ({ ...v, featured: e.target.checked }))}
                  />
                  Destacar na home
                </label>
                <button
                  className='btn-primary w-full'
                  disabled={!newEvent.name || !newEvent.scheduledAt || loading}
                  onClick={() => {
                    void submit('Criar edição', async () => {
                      const created = await adminJson<ArmageddonEvent>('/admin/armageddon', {
                        method: 'POST',
                        body: JSON.stringify({
                          name: newEvent.name,
                          description: newEvent.description || undefined,
                          scheduledAt: new Date(newEvent.scheduledAt).toISOString(),
                          endsAt: newEvent.endsAt ? new Date(newEvent.endsAt).toISOString() : undefined,
                          bannerUrl: newEvent.bannerUrl || undefined,
                          featured: newEvent.featured,
                          format: newEvent.format,
                        }),
                      });
                      setSelectedId(created.id);
                      setNewEvent({ name: '', description: '', scheduledAt: '', endsAt: '', bannerUrl: '', featured: false, format: 'TOP_20' });
                    }, 'list');
                  }}
                >
                  Criar edição
                </button>
              </div>
            </div>
          </aside>

          {/* Detail */}
          <div>
            {!detail ? (
              <div className='rounded-2xl border border-white/10 bg-[#101525] p-6 text-sm text-white/60'>
                Selecione uma edição na barra lateral, ou crie uma nova.
              </div>
            ) : (
              <div className='space-y-4'>
                {/* Header card */}
                <div className='rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-5'>
                  <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='min-w-0 flex-1'>
                      <h2 className='text-lg font-bold'>{detail.name}</h2>
                      {detail.description && (
                        <p className='mt-1 text-xs text-white/60'>{detail.description}</p>
                      )}
                      <div className='mt-2 flex flex-wrap items-center gap-3 text-[11px] text-white/50'>
                        <span>📅 {new Date(detail.scheduledAt).toLocaleString('pt-BR')}</span>
                        {detail.endsAt && <span>→ {new Date(detail.endsAt).toLocaleString('pt-BR')}</span>}
                        <span>· {detail.format}</span>
                        <span>· {detail.rosterCount}/{maxPositions} pilotos</span>
                      </div>
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <select
                        className='field-sm'
                        value={detail.status}
                        onChange={async (e) => {
                          const newStatus = e.target.value;
                          const target = e.target;
                          if (newStatus === 'FINISHED' || newStatus === 'CANCELED') {
                            const ok = await confirm({
                              title: newStatus === 'FINISHED' ? 'Encerrar Armageddon?' : 'Cancelar Armageddon?',
                              message: newStatus === 'FINISHED'
                                ? 'Confirma encerrar esta edição? Verifique se todos os confrontos foram auditados — apostas em confrontos não auditados ficam órfãs.'
                                : 'Confirma cancelar esta edição?',
                              highlightText: detail.name,
                              danger: true,
                              confirmLabel: 'Sim, confirmar',
                            });
                            if (!ok) { target.value = detail.status; return; }
                          }
                          void submit('Atualizar status', () =>
                            adminJson(`/admin/armageddon/${detail.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ status: newStatus }),
                            }), 'both');
                        }}
                      >
                        <option value='DRAFT'>Rascunho</option>
                        <option value='ROSTER_OPEN'>Roster aberto</option>
                        <option value='IN_PROGRESS'>Em andamento</option>
                        <option value='FINISHED'>Encerrado</option>
                        <option value='CANCELED'>Cancelado</option>
                      </select>
                      <button
                        className='btn-danger'
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Excluir edição do Armageddon?',
                            message: 'Esta ação remove a edição e todos os confrontos vinculados. Apostas pendentes podem ser afetadas.',
                            highlightText: detail.name,
                            danger: true,
                            confirmLabel: 'Sim, excluir',
                          });
                          if (!ok) return;
                          void submit('Excluir edição', async () => {
                            await adminJson(`/admin/armageddon/${detail.id}`, { method: 'DELETE' });
                            setSelectedId(null);
                          }, 'list');
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className='mt-4 flex flex-wrap gap-2 border-b border-white/10'>
                    {(['importar', 'roster', 'chave'] as const).map((t) => (
                      <button
                        key={t}
                        type='button'
                        onClick={() => setTab(t)}
                        className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                          tab === t
                            ? 'border-b-2 border-rose-400 text-rose-300'
                            : 'text-white/50 hover:text-white/80'
                        }`}
                      >
                        {t === 'importar' ? 'Importar pilotos' : t === 'roster' ? `Roster (${detail.rosterCount})` : 'Chave & Confrontos'}
                      </button>
                    ))}
                  </div>
                </div>

                {tab === 'importar' && (
                  <ImportPilotsPanel
                    detail={detail}
                    sourceLists={sourceLists}
                    selections={importSelections}
                    setSelections={setImportSelections}
                    totalSelected={totalSelected}
                    maxPositions={maxPositions}
                    submit={submit}
                    adminJson={adminJson}
                    confirm={confirm}
                    onCleared={() => setImportSelections({})}
                  />
                )}

                {tab === 'roster' && <RosterPanel detail={detail} submit={submit} adminJson={adminJson} confirm={confirm} />}

                {tab === 'chave' && <BracketPanel detail={detail} submit={submit} adminJson={adminJson} confirm={confirm} />}
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .field-sm {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          color: #fff;
          padding: 0.4rem 0.6rem;
          border-radius: 0.5rem;
          font-size: 0.75rem;
        }
        .field-sm:focus { outline: none; border-color: #d4a843; }
        .btn-primary {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: #fff;
          padding: 0.5rem 0.9rem;
          border-radius: 0.5rem;
          font-size: 0.75rem;
          font-weight: 600;
          transition: all 0.15s;
        }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
        .btn-outline {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          color: #fff;
          padding: 0.4rem 0.8rem;
          border-radius: 0.5rem;
          font-size: 0.75rem;
          font-weight: 500;
          transition: all 0.15s;
        }
        .btn-outline:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
        .btn-outline:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-danger {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          color: #fca5a5;
          padding: 0.4rem 0.8rem;
          border-radius: 0.5rem;
          font-size: 0.75rem;
          font-weight: 500;
          transition: all 0.15s;
        }
        .btn-danger:hover:not(:disabled) { background: rgba(239,68,68,0.2); }
        .btn-danger:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>
    </main>
  );
}

function CenteredMsg({ msg, danger }: { msg: string; danger?: boolean }) {
  return (
    <main className='min-h-screen bg-[#090b11] text-white grid place-items-center'>
      <div className={`rounded-xl border px-5 py-3 text-sm ${danger ? 'border-rose-500/30 bg-rose-500/10 text-rose-200' : 'border-white/10 bg-white/5 text-white/80'}`}>
        {msg}
      </div>
    </main>
  );
}

// ── Sub-panels ──

type SubmitFn = (label: string, action: () => Promise<unknown>, reload?: 'list' | 'detail' | 'both') => Promise<void>;
type JsonFn = <T>(path: string, init?: RequestInit) => Promise<T>;
type ConfirmFn = ReturnType<typeof useConfirm>;

function ImportPilotsPanel({
  detail, sourceLists, selections, setSelections, totalSelected, maxPositions, submit, adminJson, confirm, onCleared,
}: {
  detail: ArmageddonEvent;
  sourceLists: SourceList[];
  selections: Record<string, number>;
  setSelections: (v: Record<string, number>) => void;
  totalSelected: number;
  maxPositions: number;
  submit: SubmitFn;
  adminJson: JsonFn;
  confirm: ConfirmFn;
  onCleared: () => void;
}) {
  const slotsAvailable = maxPositions - detail.rosterCount;

  return (
    <div className='rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h3 className='text-sm font-semibold'>Importar pilotos das listas</h3>
          <p className='mt-1 text-xs text-white/50'>
            Selecione quantos pilotos você quer trazer de cada lista homologada. Item 70 do regulamento limita a <strong>50%</strong> do TOP de cada lista quando não há sobra de vagas.
          </p>
        </div>
        <div className='text-right text-xs'>
          <div className='text-white/50'>Slots disponíveis</div>
          <div className='text-lg font-bold text-rose-300'>{slotsAvailable}/{maxPositions}</div>
        </div>
      </div>

      {sourceLists.length === 0 ? (
        <p className='mt-4 text-xs text-white/40'>Nenhuma lista ativa encontrada. Cadastre listas em <Link href='/admin/listas' className='underline'>/admin/listas</Link>.</p>
      ) : (
        <div className='mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
          {sourceLists.map((list) => {
            const half = Math.ceil((list.format === 'TOP_10' ? 10 : 20) / 2);
            const current = selections[list.id] ?? 0;
            return (
              <div key={list.id} className='rounded-xl border border-white/10 bg-white/[0.02] p-3'>
                <div className='flex items-center justify-between gap-2'>
                  <div className='min-w-0'>
                    <div className='text-sm font-semibold'>DDD {list.areaCode}</div>
                    <div className='truncate text-[11px] text-white/50'>{list.name}</div>
                  </div>
                  <span className='rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/50'>{list.format}</span>
                </div>
                <div className='mt-2 text-[10px] text-white/40'>{list.rosterCount} pilotos · ½ = {half} (limite item 70)</div>
                <div className='mt-2 flex items-center gap-2'>
                  <input
                    type='number'
                    min={0}
                    max={Math.min(list.rosterCount, half)}
                    className='field-sm w-20'
                    value={current}
                    onChange={(e) => {
                      const n = Math.max(0, Math.min(Number(e.target.value || 0), Math.min(list.rosterCount, half)));
                      setSelections({ ...selections, [list.id]: n });
                    }}
                  />
                  <span className='text-[10px] text-white/40'>pilotos</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className='mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3'>
        <div className='text-xs'>
          <div className='text-white/60'>Total selecionado</div>
          <div className={`text-2xl font-black ${totalSelected > slotsAvailable ? 'text-rose-300' : 'text-emerald-300'}`}>
            {totalSelected}
          </div>
          {totalSelected > slotsAvailable && (
            <div className='text-[10px] text-rose-300'>Excede slots disponíveis ({slotsAvailable})</div>
          )}
        </div>
        <div className='flex flex-wrap gap-2'>
          <button
            className='btn-outline'
            disabled={totalSelected === 0}
            onClick={() => setSelections({})}
          >
            Limpar seleção
          </button>
          {detail.rosterCount > 0 && (
            <button
              className='btn-danger'
              onClick={async () => {
                const ok = await confirm({
                  title: 'Limpar roster do Armageddon?',
                  message: 'Remove TODOS os pilotos importados. A chave também precisará ser regenerada.',
                  highlightText: detail.name,
                  danger: true,
                  confirmLabel: 'Sim, limpar',
                });
                if (!ok) return;
                void submit('Limpar roster', () => adminJson(`/admin/armageddon/${detail.id}/roster`, { method: 'DELETE' }));
              }}
            >
              Limpar roster atual
            </button>
          )}
          <button
            className='btn-primary'
            disabled={totalSelected === 0 || totalSelected > slotsAvailable}
            onClick={async () => {
              const ok = await confirm({
                title: 'Importar pilotos das listas?',
                message: `Importar ${totalSelected} pilotos para o Armageddon. As listas de origem NÃO serão alteradas — é apenas um snapshot.`,
                highlightText: detail.name,
                confirmLabel: 'Sim, importar',
              });
              if (!ok) return;
              const sels = Object.entries(selections)
                .filter(([, n]) => n > 0)
                .map(([listId, count]) => ({ listId, count }));
              void submit('Importar pilotos', async () => {
                await adminJson(`/admin/armageddon/${detail.id}/roster/import-from-lists`, {
                  method: 'POST',
                  body: JSON.stringify({ selections: sels }),
                });
                onCleared();
              });
            }}
          >
            Importar {totalSelected} pilotos
          </button>
        </div>
      </div>
    </div>
  );
}

function RosterPanel({ detail, submit, adminJson, confirm }: {
  detail: ArmageddonEvent;
  submit: SubmitFn;
  adminJson: JsonFn;
  confirm: ConfirmFn;
}) {
  return (
    <div className='rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-sm font-semibold'>Roster do Armageddon</h3>
        <p className='text-[10px] text-white/40'>{detail.rosterCount}/{detail.format === 'TOP_10' ? 10 : 20} pilotos</p>
      </div>
      {detail.roster.length === 0 ? (
        <p className='mt-3 text-xs text-white/40'>Nenhum piloto importado ainda. Use a aba <strong>Importar pilotos</strong>.</p>
      ) : (
        <div className='mt-3 grid gap-1.5'>
          {detail.roster.map((r) => (
            <div key={r.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
              r.isKing ? 'border-amber-400/40 bg-amber-400/5' : 'border-white/10 bg-white/[0.02]'
            }`}>
              <div className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ${
                r.isKing ? 'bg-amber-400 text-black' : r.position <= 3 ? 'bg-rose-500/20 text-rose-200' : 'bg-white/10 text-white/70'
              }`}>
                {r.position}
              </div>
              <div className='min-w-0 flex-1'>
                <div className='truncate text-sm font-semibold'>
                  {r.isKing && <span className='mr-1'>👑</span>}
                  {r.driverName}
                </div>
                {r.fromAreaCode && (
                  <div className='text-[10px] text-white/40'>
                    Origem: DDD {r.fromAreaCode} · pos {r.fromPosition}
                  </div>
                )}
              </div>
              <button
                className='btn-danger'
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Remover piloto do roster?',
                    message: 'Esta ação não afeta a lista de origem.',
                    highlightText: r.driverName ?? '—',
                    danger: true,
                    confirmLabel: 'Sim, remover',
                  });
                  if (!ok) return;
                  void submit('Remover piloto', () => adminJson(`/admin/armageddon/${detail.id}/roster/${r.id}`, { method: 'DELETE' }));
                }}
              >
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BracketPanel({ detail, submit, adminJson, confirm }: {
  detail: ArmageddonEvent;
  submit: SubmitFn;
  adminJson: JsonFn;
  confirm: ConfirmFn;
}) {
  const grouped = new Map<string, Matchup[]>();
  for (const m of detail.matchups) {
    const k = `${m.roundNumber}-${m.roundType}`;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(m);
  }

  return (
    <div className='rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='text-sm font-semibold'>Chave & Confrontos PAR/ÍMPAR</h3>
        <div className='flex flex-wrap gap-2'>
          <button
            className='btn-outline'
            disabled={detail.rosterCount < 2}
            onClick={async () => {
              const ok = await confirm({
                title: 'Gerar rodada ÍMPAR?',
                message: 'Gera os confrontos 19×18, 17×16, ... 3×2 com base nas posições atuais do roster. Substitui rodada existente do mesmo número.',
                confirmLabel: 'Sim, gerar',
              });
              if (!ok) return;
              void submit('Gerar rodada ÍMPAR', () => adminJson(`/admin/armageddon/${detail.id}/generate-matchups`, {
                method: 'POST',
                body: JSON.stringify({ roundType: 'ODD' }),
              }));
            }}
          >
            + Rodada ÍMPAR
          </button>
          <button
            className='btn-outline'
            disabled={detail.rosterCount < 2}
            onClick={async () => {
              const ok = await confirm({
                title: 'Gerar rodada PAR?',
                message: 'Gera os confrontos 20×19, 18×17, ... 2×1 com base nas posições atuais do roster.',
                confirmLabel: 'Sim, gerar',
              });
              if (!ok) return;
              void submit('Gerar rodada PAR', () => adminJson(`/admin/armageddon/${detail.id}/generate-matchups`, {
                method: 'POST',
                body: JSON.stringify({ roundType: 'EVEN' }),
              }));
            }}
          >
            + Rodada PAR
          </button>
        </div>
      </div>

      {detail.matchups.length === 0 ? (
        <p className='mt-3 text-xs text-white/40'>
          Nenhum confronto gerado ainda. Importe pelo menos 2 pilotos e use os botões acima para gerar a chave PAR/ÍMPAR.
        </p>
      ) : (
        <div className='mt-4 space-y-4'>
          {Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, ms]) => {
              const first = ms[0];
              const label = first.roundType === 'ODD' ? 'ÍMPAR' : first.roundType === 'EVEN' ? 'PAR' : 'SHARK';
              return (
                <div key={key} className='rounded-xl border border-white/10 bg-white/[0.02] p-3'>
                  <p className='text-[10px] font-semibold uppercase tracking-widest text-white/40'>
                    Rodada {first.roundNumber} · {label}
                  </p>
                  <div className='mt-2 grid grid-cols-1 gap-2'>
                    {ms.slice().sort((a, b) => a.order - b.order).map((m) => (
                      <ArmageddonMatchupRow key={m.id} matchup={m} submit={submit} adminJson={adminJson} confirm={confirm} />
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function ArmageddonMatchupRow({ matchup, submit, adminJson, confirm }: {
  matchup: Matchup;
  submit: SubmitFn;
  adminJson: JsonFn;
  confirm: ConfirmFn;
}) {
  const settled = !!matchup.winnerSide;
  return (
    <div className={`rounded-lg border px-3 py-2 ${
      settled ? 'border-emerald-500/20 bg-emerald-500/5'
        : matchup.marketOpen ? 'border-blue-500/30 bg-blue-500/5'
        : 'border-white/10 bg-[#101525]'
    }`}>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-[10px] font-bold text-white/40'>#{matchup.order}</span>
        {matchup.marketOpen && !settled && (
          <span className='rounded-full bg-blue-500/20 px-2 py-0.5 text-[9px] font-bold text-blue-300'>MERCADO ABERTO</span>
        )}
        <span className={`flex-1 min-w-0 truncate text-sm ${
          matchup.winnerSide === 'LEFT' ? 'font-bold text-emerald-300' : 'text-white/80'
        }`}>
          {matchup.leftPosition && <span className='mr-1 text-[10px] text-white/40'>[{matchup.leftPosition}]</span>}
          {matchup.leftDriverName ?? '—'}
        </span>
        <span className='text-[10px] font-bold text-white/40'>VS</span>
        <span className={`flex-1 min-w-0 truncate text-right text-sm ${
          matchup.winnerSide === 'RIGHT' ? 'font-bold text-emerald-300' : 'text-white/80'
        }`}>
          {matchup.rightDriverName ?? '—'}
          {matchup.rightPosition && <span className='ml-1 text-[10px] text-white/40'>[{matchup.rightPosition}]</span>}
        </span>
      </div>
      <div className='mt-2 flex flex-wrap items-center justify-end gap-2'>
        <button
          className={`btn-outline ${matchup.marketOpen ? 'border-blue-400/50 bg-blue-500/15 text-blue-200' : ''}`}
          disabled={settled}
          onClick={() => void submit(
            matchup.marketOpen ? 'Fechar mercado' : 'Abrir mercado',
            () => adminJson(`/admin/armageddon/matchups/${matchup.id}/market`, {
              method: 'PATCH',
              body: JSON.stringify({ open: !matchup.marketOpen }),
            }),
          )}
        >
          {matchup.marketOpen ? 'Fechar mercado' : 'Abrir mercado'}
        </button>
        <button
          className={`btn-outline ${matchup.winnerSide === 'LEFT' ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : ''}`}
          disabled={settled}
          onClick={async () => {
            const name = matchup.leftDriverName ?? 'piloto da esquerda';
            const ok = await confirm({
              title: 'Auditar vencedor do confronto?',
              message: 'Declarar este piloto como VENCEDOR? Esta ação é IMUTÁVEL e liquida todas as apostas imediatamente.',
              highlightText: `🏆 ${name}`,
              confirmLabel: 'Sim, auditar vitória',
            });
            if (!ok) return;
            void submit('Auditar vencedor', () => adminJson(`/admin/armageddon/matchups/${matchup.id}/settle`, {
              method: 'POST',
              body: JSON.stringify({ winnerSide: 'LEFT' }),
            }));
          }}
        >
          ◄ Vence ESQ
        </button>
        <button
          className={`btn-outline ${matchup.winnerSide === 'RIGHT' ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : ''}`}
          disabled={settled}
          onClick={async () => {
            const name = matchup.rightDriverName ?? 'piloto da direita';
            const ok = await confirm({
              title: 'Auditar vencedor do confronto?',
              message: 'Declarar este piloto como VENCEDOR? Esta ação é IMUTÁVEL e liquida todas as apostas imediatamente.',
              highlightText: `🏆 ${name}`,
              confirmLabel: 'Sim, auditar vitória',
            });
            if (!ok) return;
            void submit('Auditar vencedor', () => adminJson(`/admin/armageddon/matchups/${matchup.id}/settle`, {
              method: 'POST',
              body: JSON.stringify({ winnerSide: 'RIGHT' }),
            }));
          }}
        >
          Vence DIR ►
        </button>
        <button
          className='btn-danger'
          disabled={settled}
          onClick={async () => {
            const ok = await confirm({
              title: 'Excluir confronto?',
              message: 'Esta ação remove o confronto. Não pode ser desfeita.',
              highlightText: `${matchup.leftDriverName ?? '—'} vs ${matchup.rightDriverName ?? '—'}`,
              danger: true,
              confirmLabel: 'Sim, excluir',
            });
            if (!ok) return;
            void submit('Excluir confronto', () => adminJson(`/admin/armageddon/matchups/${matchup.id}`, { method: 'DELETE' }));
          }}
        >
          Excluir
        </button>
      </div>
    </div>
  );
}
