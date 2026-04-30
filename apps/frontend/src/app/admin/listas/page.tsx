'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { apiFetch } from '@/lib/api-request';
import { clearClientSession, getStoredUser, SessionUser, setStoredUser } from '@/lib/auth';
import { getPublicApiUrl } from '@/lib/env-public';
import { useConfirm } from '@/components/confirm-dialog';
import { EventBanner } from '@/components/event-banner';

const apiUrl = getPublicApiUrl();

type RosterDriver = {
  id: string;
  position: number;
  isKing: boolean;
  driverId: string;
  driverName: string | null;
  driverNickname: string | null;
  driverCarNumber: string | null;
  driverTeam: string | null;
  driverHometown: string | null;
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
  isManualOverride: boolean;
  marketOpen: boolean;
  settledAt: string | null;
  notes: string | null;
};

type SharkTankEntry = {
  id: string;
  driverId: string;
  driverName: string | null;
  status: 'REGISTERED' | 'ELIMINATED' | 'FINALIST' | 'PROMOTED';
  seed: number | null;
  notes: string | null;
};

type ListEvent = {
  id: string;
  name: string;
  scheduledAt: string;
  endsAt: string | null;
  status: 'DRAFT' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELED';
  type?: 'REGULAR' | 'ARMAGEDDON' | 'SHARK_TANK';
  notes: string | null;
  matchups: Matchup[];
  sharkTank?: SharkTankEntry[];
};

type AdminList = {
  id: string;
  areaCode: number;
  name: string;
  format: 'TOP_10' | 'TOP_20';
  administratorName: string | null;
  hometown: string | null;
  active: boolean;
  roster: RosterDriver[];
  events?: ListEvent[];
  kingName: string | null;
  rosterCount: number;
};

export default function AdminListasPage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [lists, setLists] = useState<AdminList[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminList | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'roster' | 'events' | 'shark'>('roster');

  const [newList, setNewList] = useState({ areaCode: '', name: '', format: 'TOP_20' as 'TOP_10' | 'TOP_20', administratorName: '', hometown: '' });
  const [newEvent, setNewEvent] = useState({ name: '', scheduledAt: '', endsAt: '', notes: '', bannerUrl: '', featured: false, type: 'REGULAR' as 'REGULAR' | 'ARMAGEDDON' | 'SHARK_TANK' });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const confirm = useConfirm();

  const isAllowed = useMemo(() => sessionUser?.role === 'ADMIN', [sessionUser]);

  useEffect(() => {
    setSessionUser(getStoredUser());
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch(`${apiUrl}/auth/me`, { cache: 'no-store' });
        if (!res.ok) {
          clearClientSession();
          setSessionUser(null);
          return;
        }
        const me = (await res.json()) as SessionUser;
        setSessionUser(me);
        setStoredUser(me);
      } catch {
        setSessionUser(null);
      } finally {
        setSessionReady(true);
      }
    })();
  }, []);

  const adminJson = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await apiFetch(`${apiUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (response.status === 401 || response.status === 403) {
      clearClientSession();
      setSessionUser(null);
      throw new Error('Sessão expirada ou sem permissão.');
    }
    if (!response.ok) {
      const raw = await response.text();
      let friendly = raw;
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.message) && parsed.message[0]) friendly = parsed.message.join('; ');
        else if (typeof parsed?.message === 'string') friendly = parsed.message;
        else if (typeof parsed?.error === 'string') friendly = parsed.error;
      } catch { /* não era JSON */ }
      if (response.status >= 500) {
        friendly = `Erro no servidor (${response.status}): ${friendly || 'Tente novamente em instantes.'}`;
      }
      throw new Error(friendly);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }, []);

  const loadLists = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminJson<AdminList[]>('/admin/brazil-lists');
      setLists(data);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Falha ao carregar listas');
    } finally {
      setLoading(false);
    }
  }, [adminJson]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const data = await adminJson<AdminList>(`/admin/brazil-lists/${id}`);
      setDetail(data);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Falha ao carregar detalhe');
    } finally {
      setLoading(false);
    }
  }, [adminJson]);

  useEffect(() => {
    if (!sessionReady || !isAllowed) return;
    void loadLists();
  }, [sessionReady, isAllowed, loadLists]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function submit(
    label: string,
    action: () => Promise<unknown>,
    reload: 'list' | 'detail' | 'both' | 'none' = 'detail',
  ) {
    setLoading(true);
    setStatusMessage('');
    try {
      await action();
      const tasks: Promise<unknown>[] = [];
      if (reload === 'list' || reload === 'both') tasks.push(loadLists());
      if ((reload === 'detail' || reload === 'both') && selectedId) tasks.push(loadDetail(selectedId));
      if (tasks.length) await Promise.all(tasks);
      setStatusMessage(`${label}: sucesso.`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : `Falha em ${label}`);
    } finally {
      setLoading(false);
    }
  }

  if (!sessionReady) {
    return (
      <main className='min-h-screen bg-[#090b11] text-white'>
        <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
          <MainNav />
          <p className='mt-10 text-center text-white/50'>Carregando…</p>
        </div>
      </main>
    );
  }
  if (!isAllowed) {
    return (
      <main className='min-h-screen bg-[#090b11] text-white'>
        <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
          <MainNav />
          <section className='mt-8 rounded-2xl border border-red-400/40 bg-red-500/10 p-6'>
            <h1 className='text-2xl font-bold'>Permissão insuficiente</h1>
            <p className='mt-2 text-white/80'>Apenas administradores podem acessar a gestão de Listas Brasil.</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className='min-h-screen bg-[#090b11] text-white pb-10'>
      <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
        <MainNav />

        <section className='mt-2 rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-6'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='min-w-0 flex-1'>
              <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30'>Admin · Listas Brasil</p>
              <h1 className='mt-1 text-xl sm:text-2xl md:text-3xl font-bold tracking-tight'>Gestão das Listas Brasil</h1>
              <p className='mt-2 text-xs sm:text-sm text-white/60'>
                Gerencie listas por DDD, pilotos do TOP 10/20, eventos e chaves PAR/ÍMPAR.
              </p>
            </div>
            <Link href='/admin' className='rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 whitespace-nowrap'>
              ← Admin
            </Link>
          </div>
          {statusMessage && (() => {
            const isError = /falha|erro|invalid|not found|unauthorized|forbidden|fail|exists/i.test(statusMessage);
            const isSuccess = /sucesso/i.test(statusMessage);
            return (
              <div className={`mt-3 rounded-xl border p-3 text-sm flex items-start justify-between gap-3 ${
                isError ? 'border-red-500/40 bg-red-500/10 text-red-200'
                : isSuccess ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-white/10 bg-white/5 text-white/70'
              }`}>
                <span className='flex-1'>
                  {isError && <span className='mr-2'>⚠️</span>}
                  {isSuccess && <span className='mr-2'>✅</span>}
                  {statusMessage}
                </span>
                <button onClick={() => setStatusMessage('')} className='shrink-0 text-white/40 hover:text-white' aria-label='Fechar'>×</button>
              </div>
            );
          })()}
        </section>

        <div className='mt-4 sm:mt-6 grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[320px_1fr]'>
          {/* ── Sidebar: lista de listas ───────────────── */}
          <aside className='space-y-3 sm:space-y-4'>
            <div className='rounded-2xl border border-white/10 bg-[#101525] p-4'>
              <h2 className='text-sm font-semibold'>Nova lista</h2>
              <form
                className='mt-3 space-y-2'
                onSubmit={(e) => {
                  e.preventDefault();
                  const areaCode = Number(newList.areaCode);
                  if (!Number.isFinite(areaCode) || areaCode < 10 || areaCode > 99) {
                    setStatusMessage('DDD inválido (10–99)');
                    return;
                  }
                  void submit('Criar lista', async () => {
                    await adminJson('/admin/brazil-lists', {
                      method: 'POST',
                      body: JSON.stringify({
                        areaCode,
                        name: newList.name || `Lista Área ${areaCode}`,
                        format: newList.format,
                        administratorName: newList.administratorName || undefined,
                        hometown: newList.hometown || undefined,
                        active: false,
                      }),
                    });
                    setNewList({ areaCode: '', name: '', format: 'TOP_20', administratorName: '', hometown: '' });
                  }, 'list');
                }}
              >
                <input className='field-sm' placeholder='DDD (ex: 43)' value={newList.areaCode}
                  onChange={(e) => setNewList((s) => ({ ...s, areaCode: e.target.value }))} />
                <input className='field-sm' placeholder='Nome (opcional)' value={newList.name}
                  onChange={(e) => setNewList((s) => ({ ...s, name: e.target.value }))} />
                <select className='field-sm' value={newList.format}
                  onChange={(e) => setNewList((s) => ({ ...s, format: e.target.value as 'TOP_10' | 'TOP_20' }))}>
                  <option value='TOP_20'>TOP 20</option>
                  <option value='TOP_10'>TOP 10</option>
                </select>
                <input className='field-sm' placeholder='Administrador (opcional)' value={newList.administratorName}
                  onChange={(e) => setNewList((s) => ({ ...s, administratorName: e.target.value }))} />
                <input className='field-sm' placeholder='Cidade sede (opcional)' value={newList.hometown}
                  onChange={(e) => setNewList((s) => ({ ...s, hometown: e.target.value }))} />
                <button type='submit' className='btn-primary w-full'>Criar</button>
              </form>
            </div>

            <div className='rounded-2xl border border-white/10 bg-[#101525] p-3'>
              <div className='mb-2 flex items-center justify-between'>
                <h2 className='text-sm font-semibold'>Listas ({lists.length})</h2>
                <button className='text-xs text-white/40 hover:text-white' onClick={() => void loadLists()}>recarregar</button>
              </div>
              <div className='space-y-1 max-h-[60vh] overflow-auto'>
                {lists.map((l) => (
                  <button key={l.id} type='button'
                    onClick={() => setSelectedId(l.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${selectedId === l.id ? 'bg-white/10 text-white' : 'bg-white/[0.02] text-white/70 hover:bg-white/5'}`}
                  >
                    <div className='flex items-center gap-2'>
                      <span className='inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[11px] font-bold'>{l.areaCode}</span>
                      <div className='flex-1 min-w-0'>
                        <p className='truncate font-medium'>{l.name}</p>
                        <p className='text-[10px] text-white/40'>{l.format} · {l.rosterCount} pilotos · {l.active ? <span className='text-emerald-400'>ATIVA</span> : <span className='text-white/40'>inativa</span>}</p>
                      </div>
                    </div>
                  </button>
                ))}
                {!lists.length && !loading && <p className='px-2 py-4 text-xs text-white/40'>Nenhuma lista cadastrada.</p>}
              </div>
            </div>
          </aside>

          {/* ── Detalhe ─────────────────────────────── */}
          <section className='space-y-4'>
            {!detail && <div className='rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-white/40'>Selecione uma lista para gerenciar.</div>}
            {detail && (
              <>
                <ListHeader list={detail} submit={submit} adminJson={adminJson} confirm={confirm} />
                <NextRoundPanel list={detail} submit={submit} adminJson={adminJson} confirm={confirm} setActiveTab={setActiveTab} setSelectedEventId={setSelectedEventId} />
                <div className='rounded-2xl border border-white/10 bg-[#101525] p-2'>
                  <div className='flex gap-1'>
                    {(['roster', 'events', 'shark'] as const).map((t) => (
                      <button key={t} type='button' onClick={() => setActiveTab(t)}
                        className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${activeTab === t ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'}`}
                      >
                        {t === 'roster' ? 'Grade de pilotos' : t === 'events' ? 'Eventos & Chaves' : 'Shark Tank'}
                      </button>
                    ))}
                  </div>
                </div>

                {activeTab === 'roster' && <RosterPanel list={detail} submit={submit} adminJson={adminJson} confirm={confirm} />}
                {activeTab === 'events' && (
                  <EventsPanel
                    list={detail}
                    submit={submit}
                    adminJson={adminJson}
                    confirm={confirm}
                    newEvent={newEvent}
                    setNewEvent={setNewEvent}
                    selectedEventId={selectedEventId}
                    setSelectedEventId={setSelectedEventId}
                  />
                )}
                {activeTab === 'shark' && (
                  <SharkPanel
                    list={detail}
                    submit={submit}
                    adminJson={adminJson}
                    confirm={confirm}
                    selectedEventId={selectedEventId}
                    setSelectedEventId={setSelectedEventId}
                  />
                )}
              </>
            )}
          </section>
        </div>
      </div>

      <style jsx global>{`
        .field-sm {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          padding: 0.5rem 0.75rem;
          font-size: 0.8125rem;
          color: #fff;
          outline: none;
        }
        .field-sm:focus {
          border-color: rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.05);
        }
        .btn-primary {
          border-radius: 0.5rem;
          background: #fff;
          padding: 0.5rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
          color: #000;
          transition: opacity 0.15s;
        }
        .btn-primary:hover { opacity: 0.9; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-outline {
          border-radius: 0.5rem;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.05);
          padding: 0.4rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: rgba(255,255,255,0.8);
          transition: background 0.15s;
        }
        .btn-outline:hover { background: rgba(255,255,255,0.1); }
        .btn-danger {
          border-radius: 0.5rem;
          border: 1px solid rgba(239,68,68,0.3);
          background: rgba(239,68,68,0.15);
          padding: 0.4rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: rgb(252,165,165);
          transition: background 0.15s;
        }
        .btn-danger:hover { background: rgba(239,68,68,0.25); }
      `}</style>
    </main>
  );
}

// ── Sub-components ───────────────────────────────────

type SubmitFn = (
  label: string,
  action: () => Promise<unknown>,
  reload?: 'list' | 'detail' | 'both' | 'none',
) => Promise<void>;
type JsonFn = <T>(path: string, init?: RequestInit) => Promise<T>;
type ConfirmFn = ReturnType<typeof useConfirm>;

function ListHeader({ list, submit, adminJson, confirm }: { list: AdminList; submit: SubmitFn; adminJson: JsonFn; confirm: ConfirmFn }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: list.name,
    administratorName: list.administratorName ?? '',
    hometown: list.hometown ?? '',
    format: list.format,
    active: list.active,
  });
  useEffect(() => {
    setForm({
      name: list.name,
      administratorName: list.administratorName ?? '',
      hometown: list.hometown ?? '',
      format: list.format,
      active: list.active,
    });
  }, [list.id]);

  return (
    <div className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <div className='flex items-center gap-3'>
            <span className='inline-flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-blue-500/20 to-orange-500/20 text-base font-bold'>{list.areaCode}</span>
            <div>
              <p className='text-xs uppercase tracking-widest text-white/40'>DDD {list.areaCode}</p>
              <h2 className='text-xl font-bold tracking-tight'>{list.name}</h2>
            </div>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider ${list.active ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' : 'border-white/10 bg-white/5 text-white/50'}`}>
            {list.active ? 'ATIVA' : 'INATIVA'}
          </span>
          <button className='btn-outline' onClick={() => setEditing((v) => !v)}>{editing ? 'Cancelar' : 'Editar'}</button>
          <button className='btn-outline' onClick={() => {
            void submit(list.active ? 'Desativar lista' : 'Ativar lista', () =>
              adminJson(`/admin/brazil-lists/${list.id}`, { method: 'PATCH', body: JSON.stringify({ active: !list.active }) }),
              'both',
            );
          }}>{list.active ? 'Desativar' : 'Ativar'}</button>
          <button className='btn-danger' onClick={async () => {
            const ok = await confirm({
              title: 'Excluir lista?',
              message: 'Esta ação irá remover permanentemente esta lista e todos os seus dados associados.',
              highlightText: list.name,
              danger: true,
              confirmLabel: 'Sim, excluir',
            });
            if (!ok) return;
            void submit('Excluir lista', () => adminJson(`/admin/brazil-lists/${list.id}`, { method: 'DELETE' }), 'list');
          }}>Excluir</button>
        </div>
      </div>
      {editing && (
        <form
          className='mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2'
          onSubmit={(e) => {
            e.preventDefault();
            void submit('Atualizar lista', () =>
              adminJson(`/admin/brazil-lists/${list.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  name: form.name,
                  administratorName: form.administratorName || undefined,
                  hometown: form.hometown || undefined,
                  format: form.format,
                  active: form.active,
                }),
              }),
              'both',
            );
            setEditing(false);
          }}
        >
          <input className='field-sm' placeholder='Nome' value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
          <select className='field-sm' value={form.format} onChange={(e) => setForm((s) => ({ ...s, format: e.target.value as 'TOP_10' | 'TOP_20' }))}>
            <option value='TOP_20'>TOP 20</option>
            <option value='TOP_10'>TOP 10</option>
          </select>
          <input className='field-sm' placeholder='Administrador' value={form.administratorName} onChange={(e) => setForm((s) => ({ ...s, administratorName: e.target.value }))} />
          <input className='field-sm' placeholder='Cidade sede' value={form.hometown} onChange={(e) => setForm((s) => ({ ...s, hometown: e.target.value }))} />
          <label className='flex items-center gap-2 text-xs text-white/70'>
            <input type='checkbox' checked={form.active} onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))} />
            Lista ativa
          </label>
          <button type='submit' className='btn-primary sm:col-span-2'>Salvar</button>
        </form>
      )}
    </div>
  );
}

function RosterPanel({ list, submit, adminJson, confirm }: { list: AdminList; submit: SubmitFn; adminJson: JsonFn; confirm: ConfirmFn }) {
  const max = list.format === 'TOP_20' ? 20 : 10;
  const byPos = new Map<number, RosterDriver>();
  for (const r of list.roster) byPos.set(r.position, r);

  const [addForm, setAddForm] = useState({
    position: '',
    driverName: '',
    driverNickname: '',
    driverCarNumber: '',
    driverTeam: '',
    driverHometown: '',
    isKing: false,
  });

  return (
    <div className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
      <h3 className='text-sm font-semibold'>Adicionar / substituir piloto</h3>
      <form
        className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'
        onSubmit={(e) => {
          e.preventDefault();
          const position = Number(addForm.position);
          if (!Number.isFinite(position) || position < 1 || position > max) return;
          void submit('Adicionar piloto', () =>
            adminJson(`/admin/brazil-lists/${list.id}/roster`, {
              method: 'POST',
              body: JSON.stringify({
                position,
                driverName: addForm.driverName,
                driverNickname: addForm.driverNickname || undefined,
                driverCarNumber: addForm.driverCarNumber || undefined,
                driverTeam: addForm.driverTeam || undefined,
                driverHometown: addForm.driverHometown || undefined,
                isKing: addForm.isKing,
              }),
            }),
            'both',
          );
          setAddForm({ position: '', driverName: '', driverNickname: '', driverCarNumber: '', driverTeam: '', driverHometown: '', isKing: false });
        }}
      >
        <input className='field-sm' placeholder={`Posição (1–${max})`} value={addForm.position} onChange={(e) => setAddForm((s) => ({ ...s, position: e.target.value }))} />
        <input className='field-sm' placeholder='Nome do piloto' value={addForm.driverName} onChange={(e) => setAddForm((s) => ({ ...s, driverName: e.target.value }))} />
        <input className='field-sm' placeholder='Apelido (opc)' value={addForm.driverNickname} onChange={(e) => setAddForm((s) => ({ ...s, driverNickname: e.target.value }))} />
        <input className='field-sm' placeholder='Nº do carro (opc)' value={addForm.driverCarNumber} onChange={(e) => setAddForm((s) => ({ ...s, driverCarNumber: e.target.value }))} />
        <input className='field-sm' placeholder='Equipe (opc)' value={addForm.driverTeam} onChange={(e) => setAddForm((s) => ({ ...s, driverTeam: e.target.value }))} />
        <input className='field-sm' placeholder='Cidade (opc)' value={addForm.driverHometown} onChange={(e) => setAddForm((s) => ({ ...s, driverHometown: e.target.value }))} />
        <label className='flex items-center gap-2 text-xs text-white/70'>
          <input type='checkbox' checked={addForm.isKing} onChange={(e) => setAddForm((s) => ({ ...s, isKing: e.target.checked }))} />
          Marcar como Rei
        </label>
        <button type='submit' className='btn-primary sm:col-span-2 lg:col-span-1'>Salvar piloto</button>
      </form>

      <h3 className='mt-6 text-sm font-semibold'>Grade ({list.rosterCount} / {max})</h3>
      <div className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2'>
        {Array.from({ length: max }, (_, idx) => {
          const pos = idx + 1;
          const entry = byPos.get(pos);
          return (
            <div key={pos} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${entry ? (entry.isKing ? 'border-[#d4a843]/40 bg-[#d4a843]/10' : 'border-white/10 bg-white/[0.03]') : 'border-dashed border-white/10 bg-white/[0.01]'}`}>
              <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${entry?.isKing ? 'bg-[#d4a843]/30 text-[#d4a843]' : 'bg-white/10 text-white/60'}`}>{pos}</span>
              <div className='flex-1 min-w-0'>
                {entry ? (
                  <>
                    <p className='text-sm font-medium truncate'>{entry.driverName}</p>
                    <p className='text-[10px] text-white/40'>{entry.driverTeam ?? '—'}{entry.driverCarNumber ? ` · #${entry.driverCarNumber}` : ''}</p>
                  </>
                ) : (
                  <p className='text-xs italic text-white/30'>Vaga em aberto</p>
                )}
              </div>
              {entry && (
                <div className='flex items-center gap-1'>
                  <button className='btn-outline' onClick={() => {
                    void submit(entry.isKing ? 'Remover Rei' : 'Marcar Rei', () =>
                      adminJson(`/admin/brazil-lists/${list.id}/roster`, {
                        method: 'POST',
                        body: JSON.stringify({ position: entry.position, driverId: entry.driverId, isKing: !entry.isKing }),
                      }),
                      'both',
                    );
                  }}>{entry.isKing ? '👑 Remover' : 'Rei'}</button>
                  <button className='btn-danger' onClick={async () => {
                    const ok = await confirm({
                      title: 'Remover piloto da posição?',
                      message: `Esta ação irá remover o piloto da posição #${entry.position} desta lista.`,
                      highlightText: entry.driverName ?? 'Piloto',
                      danger: true,
                      confirmLabel: 'Sim, remover',
                    });
                    if (!ok) return;
                    void submit('Remover piloto', () => adminJson(`/admin/brazil-lists/${list.id}/roster/${entry.id}`, { method: 'DELETE' }), 'both');
                  }}>×</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventsPanel({
  list, submit, adminJson, confirm, newEvent, setNewEvent, selectedEventId, setSelectedEventId,
}: {
  list: AdminList;
  submit: SubmitFn;
  adminJson: JsonFn;
  confirm: ConfirmFn;
  newEvent: { name: string; scheduledAt: string; endsAt: string; notes: string; bannerUrl: string; featured: boolean; type: 'REGULAR' | 'ARMAGEDDON' | 'SHARK_TANK' };
  setNewEvent: (s: { name: string; scheduledAt: string; endsAt: string; notes: string; bannerUrl: string; featured: boolean; type: 'REGULAR' | 'ARMAGEDDON' | 'SHARK_TANK' }) => void;
  selectedEventId: string | null;
  setSelectedEventId: (id: string | null) => void;
}) {
  const selectedEvent = list.events?.find((e) => e.id === selectedEventId) ?? null;
  const [formError, setFormError] = useState<string>('');

  return (
    <>
      <div className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
        <h3 className='text-sm font-semibold'>Novo evento para esta lista</h3>
        <form
          className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2'
          onSubmit={(e) => {
            e.preventDefault();
            setFormError('');
            if (!newEvent.name || !newEvent.scheduledAt) {
              setFormError('Informe nome e data de início');
              return;
            }
            if (newEvent.endsAt) {
              const start = new Date(newEvent.scheduledAt).getTime();
              const end = new Date(newEvent.endsAt).getTime();
              if (end <= start) {
                setFormError('A data de fim deve ser posterior à data de início');
                return;
              }
            }
            void submit('Criar evento', () =>
              adminJson(`/admin/brazil-lists/${list.id}/events`, {
                method: 'POST',
                body: JSON.stringify({
                  name: newEvent.name,
                  scheduledAt: new Date(newEvent.scheduledAt).toISOString(),
                  endsAt: newEvent.endsAt ? new Date(newEvent.endsAt).toISOString() : undefined,
                  type: newEvent.type,
                  bannerUrl: newEvent.bannerUrl || undefined,
                  featured: newEvent.featured,
                  notes: newEvent.notes || undefined,
                }),
              }),
            );
            setNewEvent({ name: '', scheduledAt: '', endsAt: '', notes: '', bannerUrl: '', featured: false, type: 'REGULAR' });
          }}
        >
          <input className='field-sm sm:col-span-2' placeholder='Nome do evento' value={newEvent.name} onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })} />
          <div className='sm:col-span-1'>
            <label className='text-[10px] font-semibold text-white/40 uppercase tracking-wider'>Início</label>
            <input className='field-sm mt-1' type='datetime-local' value={newEvent.scheduledAt} onChange={(e) => setNewEvent({ ...newEvent, scheduledAt: e.target.value })} />
          </div>
          <div className='sm:col-span-1'>
            <label className='text-[10px] font-semibold text-white/40 uppercase tracking-wider'>Fim (opcional)</label>
            <input className='field-sm mt-1' type='datetime-local' value={newEvent.endsAt} onChange={(e) => setNewEvent({ ...newEvent, endsAt: e.target.value })} />
          </div>
          <select
            className='field-sm sm:col-span-2'
            value={newEvent.type}
            onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value as 'REGULAR' | 'ARMAGEDDON' | 'SHARK_TANK' })}
          >
            <option value='REGULAR'>🏁 Regular (Lista padrão)</option>
            <option value='ARMAGEDDON'>⚔️ Armageddon</option>
            <option value='SHARK_TANK'>🦈 Shark Tank</option>
          </select>
          <input className='field-sm sm:col-span-2' placeholder='URL do banner (imagem ou vídeo Vimeo/YouTube)' value={newEvent.bannerUrl} onChange={(e) => setNewEvent({ ...newEvent, bannerUrl: e.target.value })} />
          {newEvent.bannerUrl && (
            <div className='sm:col-span-2 rounded-xl overflow-hidden border border-white/10 bg-black/30'>
              <div className='relative w-full aspect-[16/9] overflow-hidden'>
                <EventBanner url={newEvent.bannerUrl} alt='preview' className='absolute inset-0 w-full h-full object-cover' />
              </div>
            </div>
          )}
          <label className='sm:col-span-2 flex items-center gap-2 text-xs text-white/70'>
            <input type='checkbox' checked={newEvent.featured} onChange={(e) => setNewEvent({ ...newEvent, featured: e.target.checked })} />
            ⭐ Destacar na home page
          </label>
          <input className='field-sm sm:col-span-2' placeholder='Notas (opc)' value={newEvent.notes} onChange={(e) => setNewEvent({ ...newEvent, notes: e.target.value })} />
          {formError && <p className='sm:col-span-2 text-xs text-red-400'>● {formError}</p>}
          <button type='submit' className='btn-primary sm:col-span-2'>Criar evento</button>
        </form>
      </div>

      <div className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
        <h3 className='text-sm font-semibold'>Eventos da lista</h3>
        {list.events && list.events.length > 0 ? (
          <div className='mt-3 space-y-2'>
            {list.events.map((ev) => (
              <button key={ev.id} type='button'
                onClick={() => setSelectedEventId(ev.id === selectedEventId ? null : ev.id)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${selectedEventId === ev.id ? 'border-white/30 bg-white/5' : 'border-white/10 bg-white/[0.02] hover:bg-white/5'}`}
              >
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 mb-1'>
                      <p className='text-sm font-semibold truncate'>{ev.name}</p>
                      {ev.type === 'ARMAGEDDON' && <span className='rounded-full bg-red-500/20 px-2 py-0.5 text-[9px] font-bold text-red-300'>⚔️ ARMAGEDDON</span>}
                      {ev.type === 'SHARK_TANK' && <span className='rounded-full bg-cyan-500/20 px-2 py-0.5 text-[9px] font-bold text-cyan-300'>🦈 SHARK TANK</span>}
                    </div>
                    <p className='text-[10px] text-white/40'>
                      {new Date(ev.scheduledAt).toLocaleString('pt-BR')}
                      {ev.endsAt && <> — até {new Date(ev.endsAt).toLocaleString('pt-BR')}</>}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                    ev.status === 'IN_PROGRESS' ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300' :
                    ev.status === 'FINISHED' ? 'border-white/10 bg-white/5 text-white/50' :
                    ev.status === 'CANCELED' ? 'border-red-500/30 bg-red-500/15 text-red-300' :
                    'border-amber-500/30 bg-amber-500/15 text-amber-300'
                  }`}>{ev.status}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className='mt-2 text-xs text-white/40'>Sem eventos cadastrados.</p>
        )}
      </div>

      {selectedEvent && (
        <EventDetailPanel
          list={list}
          event={selectedEvent}
          submit={submit}
          adminJson={adminJson}
          confirm={confirm}
        />
      )}
    </>
  );
}

function EventDetailPanel({
  list, event, submit, adminJson, confirm,
}: { list: AdminList; event: ListEvent; submit: SubmitFn; adminJson: JsonFn; confirm: ConfirmFn }) {
  const grouped = new Map<string, Matchup[]>();
  for (const m of event.matchups) {
    const k = `${m.roundNumber}-${m.roundType}`;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(m);
  }

  return (
    <div className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <p className='text-[10px] font-semibold uppercase tracking-widest text-white/40'>Evento selecionado</p>
          <h3 className='text-base font-semibold'>{event.name}</h3>
        </div>
        <div className='flex items-center gap-2'>
          <button className='btn-outline' onClick={() => {
            void submit('Gerar rodada ÍMPAR', () =>
              adminJson(`/admin/brazil-list-events/${event.id}/generate-matchups`, {
                method: 'POST',
                body: JSON.stringify({ roundType: 'ODD' }),
              }),
            );
          }}>+ Rodada ÍMPAR</button>
          <button className='btn-outline' onClick={() => {
            void submit('Gerar rodada PAR', () =>
              adminJson(`/admin/brazil-list-events/${event.id}/generate-matchups`, {
                method: 'POST',
                body: JSON.stringify({ roundType: 'EVEN' }),
              }),
            );
          }}>+ Rodada PAR</button>
          <select className='field-sm' value={event.status} onChange={async (e) => {
            const newStatus = e.target.value;
            const target = e.target;
            const oldStatus = event.status;
            // Confirmacao para mudanca destrutiva
            if (newStatus === 'FINISHED' || newStatus === 'CANCELED') {
              const ok = await confirm({
                title: newStatus === 'FINISHED' ? 'Encerrar evento?' : 'Cancelar evento?',
                message: newStatus === 'FINISHED'
                  ? 'Confirma encerrar este evento? Verifique se todas as rodadas pendentes foram auditadas - apostas em rodadas nao auditadas ficam orfas.'
                  : 'Confirma cancelar este evento?',
                highlightText: event.name,
                danger: true,
                confirmLabel: 'Sim, confirmar',
              });
              if (!ok) {
                target.value = oldStatus;
                return;
              }
            }
            void submit('Atualizar status', () =>
              adminJson(`/admin/brazil-list-events/${event.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus }),
              }),
            );
          }}>
            <option value='DRAFT'>DRAFT</option>
            <option value='IN_PROGRESS'>EM ANDAMENTO</option>
            <option value='FINISHED'>ENCERRADO</option>
            <option value='CANCELED'>CANCELADO</option>
          </select>
          <button className='btn-danger' onClick={async () => {
            const ok = await confirm({
              title: 'Excluir evento?',
              message: 'Esta ação irá remover o evento e todos os seus confrontos. Apostas existentes podem ser afetadas.',
              highlightText: event.name,
              danger: true,
              confirmLabel: 'Sim, excluir',
            });
            if (!ok) return;
            void submit('Excluir evento', () => adminJson(`/admin/brazil-list-events/${event.id}`, { method: 'DELETE' }));
          }}>Excluir evento</button>
        </div>
      </div>

      {event.matchups.length === 0 ? (
        <p className='mt-3 text-xs text-white/40'>Nenhum confronto ainda. Use "Gerar Rodada" acima para criar automaticamente a partir da lista.</p>
      ) : (
        <div className='mt-4 space-y-4'>
          {Array.from(grouped.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, ms]) => {
              const first = ms[0];
              const label = first.roundType === 'ODD' ? 'ÍMPAR' : first.roundType === 'EVEN' ? 'PAR' : 'SHARK TANK';
              return (
                <div key={key} className='rounded-xl border border-white/10 bg-white/[0.02] p-3'>
                  <p className='text-[10px] font-semibold uppercase tracking-widest text-white/40'>Rodada {first.roundNumber} · {label}</p>
                  <div className='mt-2 grid grid-cols-1 gap-2'>
                    {ms.slice().sort((a, b) => a.order - b.order).map((m) => (
                      <MatchupRow key={m.id} list={list} matchup={m} submit={submit} adminJson={adminJson} confirm={confirm} />
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

function MatchupRow({ list, matchup, submit, adminJson, confirm }: { list: AdminList; matchup: Matchup; submit: SubmitFn; adminJson: JsonFn; confirm: ConfirmFn }) {
  const [editing, setEditing] = useState(false);
  const [leftDriverId, setLeftDriverId] = useState(matchup.leftDriverId ?? '');
  const [rightDriverId, setRightDriverId] = useState(matchup.rightDriverId ?? '');

  useEffect(() => {
    setLeftDriverId(matchup.leftDriverId ?? '');
    setRightDriverId(matchup.rightDriverId ?? '');
  }, [matchup.id]);

  const settled = !!matchup.winnerSide;
  return (
    <div className={`rounded-lg border px-3 py-2 ${settled ? 'border-emerald-500/20 bg-emerald-500/5' : matchup.marketOpen ? 'border-blue-500/30 bg-blue-500/5' : 'border-white/10 bg-[#101525]'}`}>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='text-[10px] font-bold text-white/40'>#{matchup.order}</span>
        {matchup.marketOpen && !settled && (
          <span className='rounded-full bg-blue-500/20 px-2 py-0.5 text-[9px] font-bold text-blue-300'>MERCADO ABERTO</span>
        )}
        <span className={`flex-1 min-w-0 truncate text-sm ${matchup.winnerSide === 'LEFT' ? 'font-bold text-emerald-300' : 'text-white/80'}`}>
          {matchup.leftPosition ? <span className='mr-1 text-[10px] text-white/40'>[{matchup.leftPosition}]</span> : null}
          {matchup.leftDriverName ?? '—'}
        </span>
        <span className='text-[10px] font-bold text-white/40'>VS</span>
        <span className={`flex-1 min-w-0 truncate text-right text-sm ${matchup.winnerSide === 'RIGHT' ? 'font-bold text-emerald-300' : 'text-white/80'}`}>
          {matchup.rightDriverName ?? '—'}
          {matchup.rightPosition ? <span className='ml-1 text-[10px] text-white/40'>[{matchup.rightPosition}]</span> : null}
        </span>
      </div>
      <div className='mt-2 flex flex-wrap items-center justify-end gap-2'>
        <button
          className={`btn-outline ${matchup.marketOpen ? 'border-blue-400/50 bg-blue-500/15 text-blue-200' : ''}`}
          disabled={settled}
          onClick={() => void submit(
            matchup.marketOpen ? 'Fechar mercado' : 'Abrir mercado',
            () => adminJson(`/admin/brazil-list-events/matchups/${matchup.id}/market`, {
              method: 'PATCH',
              body: JSON.stringify({ open: !matchup.marketOpen }),
            }),
          )}
        >
          {matchup.marketOpen ? 'Fechar mercado' : 'Abrir mercado'}
        </button>
        <button className={`btn-outline ${matchup.winnerSide === 'LEFT' ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : ''}`}
          disabled={settled}
          onClick={async () => {
            const name = matchup.leftDriverName ?? 'piloto da esquerda';
            const ok = await confirm({
              title: 'Auditar vencedor da rodada?',
              message: 'Deseja declarar este piloto como VENCEDOR da rodada? Esta ação é IMUTÁVEL e irá liquidar todas as apostas desta rodada imediatamente.',
              highlightText: `🏆 ${name}`,
              confirmLabel: 'Sim, auditar vitória',
            });
            if (!ok) return;
            void submit('Auditar vencedor', () => adminJson(`/admin/brazil-list-events/matchups/${matchup.id}/settle`, { method: 'POST', body: JSON.stringify({ winnerSide: 'LEFT' }) }));
          }}>
          ◄ Vence ESQ
        </button>
        <button className={`btn-outline ${matchup.winnerSide === 'RIGHT' ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : ''}`}
          disabled={settled}
          onClick={async () => {
            const name = matchup.rightDriverName ?? 'piloto da direita';
            const ok = await confirm({
              title: 'Auditar vencedor da rodada?',
              message: 'Deseja declarar este piloto como VENCEDOR da rodada? Esta ação é IMUTÁVEL e irá liquidar todas as apostas desta rodada imediatamente.',
              highlightText: `🏆 ${name}`,
              confirmLabel: 'Sim, auditar vitória',
            });
            if (!ok) return;
            void submit('Auditar vencedor', () => adminJson(`/admin/brazil-list-events/matchups/${matchup.id}/settle`, { method: 'POST', body: JSON.stringify({ winnerSide: 'RIGHT' }) }));
          }}>
          Vence DIR ►
        </button>
        <button className='btn-outline' disabled={settled} onClick={() => setEditing((v) => !v)}>{editing ? 'Cancelar' : 'Editar'}</button>
        <button className='btn-danger' disabled={settled} onClick={async () => {
          const ok = await confirm({
            title: 'Excluir confronto?',
            message: 'Esta ação removerá este confronto da rodada. Não pode ser desfeita.',
            highlightText: `${matchup.leftDriverName ?? '—'} vs ${matchup.rightDriverName ?? '—'}`,
            danger: true,
            confirmLabel: 'Sim, excluir',
          });
          if (!ok) return;
          void submit('Excluir confronto', () => adminJson(`/admin/brazil-list-events/matchups/${matchup.id}`, { method: 'DELETE' }));
        }}>×</button>
      </div>
      {editing && (
        <form
          className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2'
          onSubmit={(e) => {
            e.preventDefault();
            void submit('Atualizar confronto', () =>
              adminJson(`/admin/brazil-list-events/matchups/${matchup.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                  leftDriverId: leftDriverId || null,
                  rightDriverId: rightDriverId || null,
                  isManualOverride: true,
                }),
              }),
            );
            setEditing(false);
          }}
        >
          <select className='field-sm' value={leftDriverId} onChange={(e) => setLeftDriverId(e.target.value)}>
            <option value=''>— Lado esquerdo —</option>
            {list.roster.map((r) => (
              <option key={r.id} value={r.driverId}>{r.position}. {r.driverName}</option>
            ))}
          </select>
          <select className='field-sm' value={rightDriverId} onChange={(e) => setRightDriverId(e.target.value)}>
            <option value=''>— Lado direito —</option>
            {list.roster.map((r) => (
              <option key={r.id} value={r.driverId}>{r.position}. {r.driverName}</option>
            ))}
          </select>
          <button type='submit' className='btn-primary sm:col-span-2'>Salvar</button>
        </form>
      )}
    </div>
  );
}

function SharkPanel({
  list, submit, adminJson, confirm, selectedEventId, setSelectedEventId,
}: {
  list: AdminList;
  submit: SubmitFn;
  adminJson: JsonFn;
  confirm: ConfirmFn;
  selectedEventId: string | null;
  setSelectedEventId: (id: string | null) => void;
}) {
  const event = list.events?.find((e) => e.id === selectedEventId) ?? null;
  const [newDriverId, setNewDriverId] = useState('');
  const [seed, setSeed] = useState('');

  return (
    <div className='space-y-4'>
      <div className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
        <h3 className='text-sm font-semibold'>Shark Tank — selecione o evento</h3>
        {list.events && list.events.length > 0 ? (
          <select className='field-sm mt-2' value={selectedEventId ?? ''} onChange={(e) => setSelectedEventId(e.target.value || null)}>
            <option value=''>— Selecione um evento —</option>
            {list.events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name} · {new Date(ev.scheduledAt).toLocaleDateString('pt-BR')}</option>
            ))}
          </select>
        ) : (
          <p className='mt-2 text-xs text-white/40'>Crie um evento primeiro na aba "Eventos & Chaves".</p>
        )}
      </div>

      {event && (
        <>
          <div className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
            <h3 className='text-sm font-semibold'>Inscrever piloto no Shark Tank</h3>
            <form
              className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_auto]'
              onSubmit={(e) => {
                e.preventDefault();
                if (!newDriverId) return;
                void submit('Inscrever no Shark Tank', () =>
                  adminJson(`/admin/brazil-list-events/${event.id}/shark-tank/entries`, {
                    method: 'POST',
                    body: JSON.stringify({ driverId: newDriverId, seed: seed ? Number(seed) : undefined }),
                  }),
                );
                setNewDriverId('');
                setSeed('');
              }}
            >
              <input className='field-sm' placeholder='Driver ID (copie do painel de pilotos)' value={newDriverId} onChange={(e) => setNewDriverId(e.target.value)} />
              <input className='field-sm' type='number' placeholder='Seed (opc)' value={seed} onChange={(e) => setSeed(e.target.value)} />
              <button type='submit' className='btn-primary'>Adicionar</button>
            </form>
            <p className='mt-2 text-[10px] text-white/40'>Dica: para pilotos já na lista, use o driverId visível na visualização do roster. Para pilotos de fora, cadastre-os antes em Admin → Pilotos.</p>
          </div>

          <div className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
            <h3 className='text-sm font-semibold'>Inscritos ({event.sharkTank?.length ?? 0})</h3>
            {event.sharkTank && event.sharkTank.length > 0 ? (
              <div className='mt-3 space-y-2'>
                {event.sharkTank
                  .slice()
                  .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
                  .map((entry) => (
                    <div key={entry.id} className='flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2'>
                      <span className='inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-bold'>
                        {entry.seed ?? '—'}
                      </span>
                      <div className='flex-1 min-w-0'>
                        <p className='text-sm font-medium truncate'>{entry.driverName ?? entry.driverId}</p>
                      </div>
                      <select className='field-sm max-w-[160px]' value={entry.status} onChange={(e) => {
                        const newStatus = e.target.value;
                        void submit('Atualizar Shark Tank', () =>
                          adminJson(`/admin/brazil-list-events/shark-tank/entries/${entry.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: newStatus }),
                          }),
                        );
                      }}>
                        <option value='REGISTERED'>INSCRITO</option>
                        <option value='ELIMINATED'>ELIMINADO</option>
                        <option value='FINALIST'>FINALISTA</option>
                        <option value='PROMOTED'>PROMOVIDO</option>
                      </select>
                      <button className='btn-danger' onClick={async () => {
                        const ok = await confirm({
                          title: 'Remover inscrição?',
                          message: 'Remover este piloto do Shark Tank?',
                          highlightText: entry.driverName ?? entry.driverId,
                          danger: true,
                          confirmLabel: 'Sim, remover',
                        });
                        if (!ok) return;
                        void submit('Remover Shark Tank', () =>
                          adminJson(`/admin/brazil-list-events/shark-tank/entries/${entry.id}`, { method: 'DELETE' }),
                        );
                      }}>×</button>
                    </div>
                  ))}
              </div>
            ) : (
              <p className='mt-2 text-xs text-white/40'>Nenhum piloto inscrito.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NextRoundPanel({
  list, submit, adminJson, confirm, setActiveTab, setSelectedEventId,
}: {
  list: AdminList;
  submit: SubmitFn;
  adminJson: JsonFn;
  confirm: ConfirmFn;
  setActiveTab: (t: 'roster' | 'events' | 'shark') => void;
  setSelectedEventId: (id: string | null) => void;
}) {
  // Find next pending matchup across all in-progress events
  const pending = useMemo(() => {
    if (!list.events) return null;
    for (const ev of list.events) {
      if (ev.status === 'CANCELED' || ev.status === 'FINISHED') continue;
      const sorted = ev.matchups
        .filter((m) => !m.winnerSide)
        .sort((a, b) => a.roundNumber - b.roundNumber || a.order - b.order);
      const first = sorted[0];
      if (first) return { event: ev, matchup: first };
    }
    return null;
  }, [list.events]);

  if (!pending) {
    return (
      <div className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
        <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30'>Próxima rodada</p>
        <p className='mt-2 text-sm text-white/50'>Nenhuma rodada pendente. Crie um evento e gere as chaves para começar.</p>
      </div>
    );
  }

  const { event, matchup } = pending;
  const roundLabel = matchup.roundType === 'ODD' ? 'ÍMPAR' : matchup.roundType === 'EVEN' ? 'PAR' : 'SHARK TANK';

  return (
    <div className={`rounded-2xl border-2 p-4 sm:p-5 ${matchup.marketOpen ? 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5' : 'border-amber-500/40 bg-gradient-to-br from-amber-500/10 to-amber-500/5'}`}>
      <div className='flex items-start justify-between gap-3 mb-3'>
        <div className='flex-1 min-w-0'>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${matchup.marketOpen ? 'text-emerald-400' : 'text-amber-400'}`}>
            {matchup.marketOpen ? '🟢 Próxima rodada — apostas abertas' : '⚠️ Próxima rodada — aguardando'}
          </p>
          <h3 className='mt-1 text-base sm:text-lg font-bold tracking-tight truncate'>{event.name}</h3>
          <p className='text-xs text-white/50'>Rodada {matchup.roundNumber} · {roundLabel} · Conf. #{matchup.order}</p>
        </div>
        <button
          className='btn-outline text-xs whitespace-nowrap shrink-0'
          onClick={() => { setActiveTab('events'); setSelectedEventId(event.id); }}
        >
          Ver evento →
        </button>
      </div>

      <div className='grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 my-3 sm:my-4 rounded-xl bg-black/20 p-3 sm:p-4'>
        <div className='text-center min-w-0'>
          {matchup.leftPosition && <p className='text-[10px] text-white/40'>Pos {matchup.leftPosition}</p>}
          <p className='text-sm sm:text-base font-bold truncate'>{matchup.leftDriverName ?? '—'}</p>
        </div>
        <div className='text-lg sm:text-2xl font-bold text-white/30'>VS</div>
        <div className='text-center min-w-0'>
          {matchup.rightPosition && <p className='text-[10px] text-white/40'>Pos {matchup.rightPosition}</p>}
          <p className='text-sm sm:text-base font-bold truncate'>{matchup.rightDriverName ?? '—'}</p>
        </div>
      </div>

      <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
        {!matchup.marketOpen && (
          <button
            className='sm:col-span-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-black hover:bg-emerald-400 active:scale-[0.98]'
            onClick={() => void submit('Abrir mercado', () =>
              adminJson(`/admin/brazil-list-events/matchups/${matchup.id}/market`, {
                method: 'PATCH',
                body: JSON.stringify({ open: true }),
              }),
            )}
          >
            🚀 Abrir apostas desta rodada
          </button>
        )}
        {matchup.marketOpen && (
          <>
            <button
              className='rounded-lg bg-emerald-400 px-3 py-2.5 text-xs sm:text-sm font-bold text-black hover:bg-emerald-300 active:scale-[0.98] truncate'
              onClick={async () => {
                const name = matchup.leftDriverName ?? 'Esquerda';
                const ok = await confirm({
                  title: 'Auditar vencedor da rodada?',
                  message: 'Deseja declarar este piloto como VENCEDOR? Esta ação é IMUTÁVEL e irá liquidar todas as apostas.\n\nA próxima rodada será aberta automaticamente.',
                  highlightText: `🏆 ${name}`,
                  confirmLabel: 'Sim, auditar vitória',
                });
                if (!ok) return;
                void submit('Auditar vencedor', () => adminJson(`/admin/brazil-list-events/matchups/${matchup.id}/settle`, { method: 'POST', body: JSON.stringify({ winnerSide: 'LEFT' }) }));
              }}
            >
              🏆 {matchup.leftDriverName ?? 'ESQ'} venceu
            </button>
            <button
              className='rounded-lg bg-emerald-400 px-3 py-2.5 text-xs sm:text-sm font-bold text-black hover:bg-emerald-300 active:scale-[0.98] truncate'
              onClick={async () => {
                const name = matchup.rightDriverName ?? 'Direita';
                const ok = await confirm({
                  title: 'Auditar vencedor da rodada?',
                  message: 'Deseja declarar este piloto como VENCEDOR? Esta ação é IMUTÁVEL e irá liquidar todas as apostas.\n\nA próxima rodada será aberta automaticamente.',
                  highlightText: `🏆 ${name}`,
                  confirmLabel: 'Sim, auditar vitória',
                });
                if (!ok) return;
                void submit('Auditar vencedor', () => adminJson(`/admin/brazil-list-events/matchups/${matchup.id}/settle`, { method: 'POST', body: JSON.stringify({ winnerSide: 'RIGHT' }) }));
              }}
            >
              🏆 {matchup.rightDriverName ?? 'DIR'} venceu
            </button>
          </>
        )}
      </div>
    </div>
  );
}
