'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { useConfirm } from '@/components/confirm-dialog';
import { apiFetch } from '@/lib/api-request';
import { clearClientSession, getStoredUser, SessionUser, setStoredUser } from '@/lib/auth';
import { getPublicApiUrl } from '@/lib/env-public';
import { ImportPilotsModal } from './import-pilots-modal';
import { EventBanner } from '@/components/event-banner';

const apiUrl = getPublicApiUrl();

const CATEGORIES = [
  { value: 'ORIGINAL_10S', label: 'Original 10s', minTime: 10.0 },
  { value: 'CAT_9S', label: '9s', minTime: 9.0 },
  { value: 'CAT_8_5S', label: '8,5s', minTime: 8.5 },
  { value: 'CAT_8S', label: '8s', minTime: 8.0 },
  { value: 'CAT_7_5S', label: '7,5s', minTime: 7.5 },
  { value: 'CAT_7S', label: '7s', minTime: 7.0 },
  { value: 'CAT_6_5S', label: '6,5s', minTime: 6.5 },
  { value: 'CAT_6S', label: '6s', minTime: 6.0 },
  { value: 'CAT_5_5S', label: '5,5s', minTime: 5.5 },
  { value: 'TUDOKIDA', label: 'TUDOKIDÁ', minTime: null },
] as const;

type CategoryValue = typeof CATEGORIES[number]['value'];

type Driver = { id: string; name: string; nickname: string | null; carNumber: string | null; team: string | null };

type Competitor = {
  id: string;
  bracketId: string;
  driverId: string;
  carName: string | null;
  carNumber: string | null;
  qualifyingReaction: string | number | null;
  qualifyingTrack: string | number | null;
  qualifyingTotal: string | number | null;
  qualifyingPosition: number | null;
  driver: Driver;
};

type Matchup = {
  id: string;
  bracketId: string;
  roundNumber: number;
  position: number;
  isSuperFinal: boolean;
  duelId: string | null;
  marketOpen: boolean;
  leftCompetitorId: string | null;
  rightCompetitorId: string | null;
  leftReaction: string | number | null;
  leftTrack: string | number | null;
  leftQueimou: boolean;
  leftInvalid: boolean;
  rightReaction: string | number | null;
  rightTrack: string | number | null;
  rightQueimou: boolean;
  rightInvalid: boolean;
  winnerSide: 'LEFT' | 'RIGHT' | null;
  status: 'PENDING' | 'COMPLETED' | 'INVALIDATED';
  settledAt: string | null;
};

type Bracket = {
  id: string;
  category: CategoryValue;
  size: number;
  competitors: Competitor[];
  matchups: Matchup[];
};

type CategoryEvent = {
  id: string;
  name: string;
  description: string | null;
  scheduledAt: string;
  endsAt: string | null;
  status: 'DRAFT' | 'REGISTRATION_OPEN' | 'QUALIFYING' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELED';
  notes: string | null;
  brackets: Bracket[];
};

export default function AdminCopaCategoriasPage() {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [events, setEvents] = useState<CategoryEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CategoryEvent | null>(null);
  const [activeBracketId, setActiveBracketId] = useState<string | null>(null);
  const [tab, setTab] = useState<'inscritos' | 'chave' | 'superfinal'>('inscritos');
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [newEvent, setNewEvent] = useState({
    name: '', description: '', scheduledAt: '', endsAt: '',
    bannerUrl: '', featured: false,
    categories: [] as CategoryValue[],
  });
  const [importOpen, setImportOpen] = useState(false);

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
      const data = await adminJson<CategoryEvent[]>('/admin/category-events');
      setEvents(data);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Falha ao carregar');
    } finally { setLoading(false); }
  }, [adminJson]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const data = await adminJson<CategoryEvent>(`/admin/category-events/${id}`);
      setDetail(data);
      if (data.brackets[0]) setActiveBracketId(data.brackets[0].id);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Falha ao carregar detalhe');
    } finally { setLoading(false); }
  }, [adminJson]);

  useEffect(() => {
    if (!sessionReady || !isAllowed) return;
    void loadEvents();
  }, [sessionReady, isAllowed, loadEvents]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  async function submit(label: string, action: () => Promise<unknown>, reload: 'list' | 'detail' | 'both' = 'detail') {
    setLoading(true); setStatusMessage('');
    try {
      await action();
      if (reload === 'list' || reload === 'both') await loadEvents();
      if ((reload === 'detail' || reload === 'both') && selectedId) await loadDetail(selectedId);
      setStatusMessage(`${label}: sucesso.`);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : `Falha em ${label}`);
    } finally { setLoading(false); }
  }

  if (!sessionReady) return <CenteredMsg msg='Carregando...' />;
  if (!isAllowed) return <CenteredMsg msg='Acesso negado. Apenas administradores.' danger />;

  const activeBracket = detail?.brackets.find((b) => b.id === activeBracketId) ?? null;

  return (
    <main className='min-h-screen bg-[#090b11] text-white pb-10'>
      <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
        <MainNav />

        <section className='mt-2 rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-6'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='min-w-0 flex-1'>
              <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30'>Admin · Copa Categorias</p>
              <h1 className='mt-1 text-xl sm:text-2xl md:text-3xl font-bold tracking-tight'>Copa Categorias</h1>
              <p className='mt-2 text-xs sm:text-sm text-white/60'>10 categorias por tempo. Inscreva pilotos, monte a chave e audite os confrontos.</p>
            </div>
            <Link href='/admin' className='rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 whitespace-nowrap'>
              ← Admin
            </Link>
          </div>
          {statusMessage && (() => {
            const isError = /falha|erro|invalid|not found|fail|exists|duplicado/i.test(statusMessage);
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
                <button onClick={() => setStatusMessage('')} className='shrink-0 text-white/40 hover:text-white'>×</button>
              </div>
            );
          })()}
        </section>

        <div className='mt-4 sm:mt-6 grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[320px_1fr]'>
          {/* Sidebar */}
          <aside className='space-y-3 sm:space-y-4'>
            <div className='rounded-2xl border border-white/10 bg-[#101525] p-4'>
              <h2 className='text-sm font-semibold'>Novo evento</h2>
              <form
                className='mt-3 space-y-2'
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newEvent.name || !newEvent.scheduledAt) { setStatusMessage('Preencha nome e data início'); return; }
                  void submit('Criar evento', () =>
                    adminJson('/admin/category-events', {
                      method: 'POST',
                      body: JSON.stringify({
                        name: newEvent.name,
                        description: newEvent.description || undefined,
                        scheduledAt: new Date(newEvent.scheduledAt).toISOString(),
                        endsAt: newEvent.endsAt ? new Date(newEvent.endsAt).toISOString() : undefined,
                        categories: newEvent.categories,
                        bannerUrl: newEvent.bannerUrl || undefined,
                        featured: newEvent.featured,
                      }),
                    }), 'list');
                  setNewEvent({ name: '', description: '', scheduledAt: '', endsAt: '', bannerUrl: '', featured: false, categories: [] });
                }}
              >
                <input className='cc-field' placeholder='Nome do evento' value={newEvent.name} onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })} />
                <input className='cc-field' placeholder='Descrição (opc)' value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} />
                <div>
                  <label className='text-[10px] uppercase tracking-wider text-white/40'>Início</label>
                  <input className='cc-field mt-1' type='datetime-local' value={newEvent.scheduledAt} onChange={(e) => setNewEvent({ ...newEvent, scheduledAt: e.target.value })} />
                </div>
                <div>
                  <label className='text-[10px] uppercase tracking-wider text-white/40'>Fim (opc)</label>
                  <input className='cc-field mt-1' type='datetime-local' value={newEvent.endsAt} onChange={(e) => setNewEvent({ ...newEvent, endsAt: e.target.value })} />
                </div>
                <div>
                  <label className='text-[10px] uppercase tracking-wider text-white/40'>Categorias iniciais</label>
                  <div className='mt-2 grid grid-cols-2 gap-1'>
                    {CATEGORIES.map((c) => (
                      <label key={c.value} className='flex items-center gap-1.5 text-xs text-white/70'>
                        <input
                          type='checkbox'
                          checked={newEvent.categories.includes(c.value)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...newEvent.categories, c.value]
                              : newEvent.categories.filter((x) => x !== c.value);
                            setNewEvent({ ...newEvent, categories: next });
                          }}
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                </div>
                <input className='cc-field' placeholder='URL do banner (imagem ou vídeo Vimeo/YouTube)' value={newEvent.bannerUrl} onChange={(e) => setNewEvent({ ...newEvent, bannerUrl: e.target.value })} />
                {newEvent.bannerUrl && (
                  <div className='rounded-xl overflow-hidden border border-white/10 bg-black/30'>
                    <div className='relative w-full aspect-[16/9] overflow-hidden'>
                      <EventBanner url={newEvent.bannerUrl} alt='preview' className='absolute inset-0 w-full h-full object-cover' />
                    </div>
                  </div>
                )}
                <label className='flex items-center gap-2 text-xs text-white/70'>
                  <input type='checkbox' checked={newEvent.featured} onChange={(e) => setNewEvent({ ...newEvent, featured: e.target.checked })} />
                  ⭐ Destacar na home
                </label>
                <button type='submit' className='cc-btn-primary w-full'>Criar evento</button>
              </form>
            </div>

            <div className='rounded-2xl border border-white/10 bg-[#101525] p-3'>
              <div className='mb-2 flex items-center justify-between'>
                <h2 className='text-sm font-semibold'>Eventos ({events.length})</h2>
                <button className='text-xs text-white/40 hover:text-white' onClick={() => void loadEvents()}>recarregar</button>
              </div>
              <div className='space-y-1 max-h-[55vh] overflow-auto'>
                {events.map((ev) => (
                  <button key={ev.id} type='button' onClick={() => setSelectedId(ev.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedId === ev.id ? 'bg-white/10' : 'bg-white/[0.02] hover:bg-white/5'}`}
                  >
                    <p className='truncate font-medium'>{ev.name}</p>
                    <p className='text-[10px] text-white/40'>
                      {new Date(ev.scheduledAt).toLocaleDateString('pt-BR')} · {ev.brackets?.length ?? 0} categorias · <span className={statusColor(ev.status)}>{ev.status}</span>
                    </p>
                  </button>
                ))}
                {!events.length && !loading && <p className='px-2 py-4 text-xs text-white/40'>Sem eventos.</p>}
              </div>
            </div>
          </aside>

          {/* Detail */}
          <section className='space-y-4'>
            {!detail && <div className='rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-white/40'>Selecione um evento.</div>}
            {detail && (
              <>
                <EventHeader
                  event={detail}
                  submit={submit}
                  adminJson={adminJson}
                  confirm={confirm}
                  onDeleted={() => {
                    setSelectedId(null);
                    setDetail(null);
                  }}
                />

                {/* Bulk import via Excel */}
                <div className='rounded-2xl border border-white/10 bg-[#101525] p-4 flex flex-wrap items-center justify-between gap-3'>
                  <div>
                    <p className='text-sm font-semibold'>📋 Importar pilotos via Excel</p>
                    <p className='mt-1 text-xs text-white/50'>
                      Cadastre vários pilotos de uma vez. A categoria é detectada pela coluna <strong>Produto</strong> da planilha
                      (separa automaticamente por 9s, 8,5s, etc.).
                    </p>
                  </div>
                  <button
                    type='button'
                    onClick={() => setImportOpen(true)}
                    className='cc-btn-primary whitespace-nowrap'
                  >
                    Importar Excel
                  </button>
                </div>

                {/* Categorias / Brackets tabs */}
                <div className='rounded-2xl border border-white/10 bg-[#101525] p-2'>
                  <div className='flex flex-wrap gap-1'>
                    {detail.brackets.map((br) => {
                      const meta = CATEGORIES.find((c) => c.value === br.category);
                      return (
                        <button key={br.id} type='button' onClick={() => setActiveBracketId(br.id)}
                          className={`rounded-xl px-3 py-2 text-xs font-semibold ${activeBracketId === br.id ? 'bg-white text-[#090b11]' : 'text-white/50 hover:bg-white/5'}`}
                        >
                          {meta?.label ?? br.category}
                          <span className='ml-2 text-[10px] opacity-60'>({br.competitors.length})</span>
                        </button>
                      );
                    })}
                    <AddCategoryButton event={detail} submit={submit} adminJson={adminJson} />
                  </div>
                </div>

                {activeBracket && (
                  <>
                    <div className='rounded-2xl border border-white/10 bg-[#101525] p-2'>
                      <div className='flex flex-wrap gap-1'>
                        <button onClick={() => setTab('inscritos')} className={`flex-1 min-w-[110px] rounded-xl px-3 py-2 text-xs font-semibold ${tab === 'inscritos' ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'}`}>
                          👥 Inscritos
                        </button>
                        <button onClick={() => setTab('chave')} className={`flex-1 min-w-[110px] rounded-xl px-3 py-2 text-xs font-semibold ${tab === 'chave' ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'}`}>
                          🏆 Chave do Evento
                        </button>
                        <button onClick={() => setTab('superfinal')} className={`flex-1 min-w-[110px] rounded-xl px-3 py-2 text-xs font-semibold ${tab === 'superfinal' ? 'bg-amber-500/20 text-amber-300' : 'text-white/50 hover:bg-white/5'}`}>
                          ⭐ Super Final
                        </button>
                      </div>
                    </div>

                    {tab === 'inscritos' && <CompetitorsPanel bracket={activeBracket} submit={submit} adminJson={adminJson} confirm={confirm} />}
                    {tab === 'chave' && <BracketBuilder bracket={activeBracket} submit={submit} adminJson={adminJson} confirm={confirm} />}
                    {tab === 'superfinal' && <SuperFinalPanel bracket={activeBracket} submit={submit} adminJson={adminJson} confirm={confirm} />}
                  </>
                )}
              </>
            )}
          </section>
        </div>

        {importOpen && detail && (
          <ImportPilotsModal
            eventId={detail.id}
            eventName={detail.name}
            onClose={() => setImportOpen(false)}
            onImported={() => {
              void loadEvents();
              if (selectedId) void loadDetail(selectedId);
            }}
            postJson={async (path, body) => {
              return adminJson(path, { method: 'POST', body: JSON.stringify(body) });
            }}
          />
        )}
      </div>

      <style jsx global>{`
        .cc-field {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.03);
          padding: 0.5rem 0.75rem;
          font-size: 0.8125rem;
          color: #fff;
          outline: none;
        }
        .cc-field:focus {
          border-color: rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.05);
        }
        .cc-btn-primary {
          border-radius: 0.5rem;
          background: #fff;
          padding: 0.5rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
          color: #000;
        }
        .cc-btn-primary:hover { opacity: 0.9; }
        .cc-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .cc-btn-outline {
          border-radius: 0.5rem;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.05);
          padding: 0.4rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: rgba(255,255,255,0.8);
        }
        .cc-btn-outline:hover { background: rgba(255,255,255,0.1); }
        .cc-btn-danger {
          border-radius: 0.5rem;
          border: 1px solid rgba(239,68,68,0.3);
          background: rgba(239,68,68,0.15);
          padding: 0.4rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: rgb(252,165,165);
        }
        .cc-btn-danger:hover { background: rgba(239,68,68,0.25); }
      `}</style>
    </main>
  );
}

// ── Sub-components ──────────────────────────────────

type SubmitFn = (label: string, action: () => Promise<unknown>, reload?: 'list' | 'detail' | 'both') => Promise<void>;
type JsonFn = <T>(path: string, init?: RequestInit) => Promise<T>;
type ConfirmFn = ReturnType<typeof useConfirm>;

function CenteredMsg({ msg, danger }: { msg: string; danger?: boolean }) {
  return (
    <main className='min-h-screen bg-[#090b11] text-white'>
      <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
        <MainNav />
        <p className={`mt-10 text-center ${danger ? 'text-red-400' : 'text-white/50'}`}>{msg}</p>
      </div>
    </main>
  );
}

function statusColor(s: string) {
  if (s === 'IN_PROGRESS' || s === 'QUALIFYING' || s === 'REGISTRATION_OPEN') return 'text-emerald-400';
  if (s === 'CANCELED') return 'text-red-400';
  if (s === 'FINISHED') return 'text-white/40';
  return 'text-amber-400';
}

function EventHeader({ event, submit, adminJson, confirm, onDeleted }: { event: CategoryEvent; submit: SubmitFn; adminJson: JsonFn; confirm: ConfirmFn; onDeleted: () => void }) {
  return (
    <div className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <p className='text-xs uppercase tracking-widest text-white/40'>Evento</p>
          <h2 className='text-xl font-bold tracking-tight'>{event.name}</h2>
          <p className='mt-1 text-xs text-white/50'>
            {new Date(event.scheduledAt).toLocaleString('pt-BR')}
            {event.endsAt && <> — até {new Date(event.endsAt).toLocaleString('pt-BR')}</>}
          </p>
          {event.description && <p className='mt-2 text-sm text-white/70'>{event.description}</p>}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusColor(event.status)} border-current`}>{event.status}</span>
          <select className='cc-field max-w-[200px]' value={event.status} onChange={(e) => {
            void submit('Atualizar status', () => adminJson(`/admin/category-events/${event.id}`, {
              method: 'PATCH', body: JSON.stringify({ status: e.target.value }),
            }), 'both');
          }}>
            <option value='DRAFT'>RASCUNHO</option>
            <option value='REGISTRATION_OPEN'>INSCRIÇÕES ABERTAS</option>
            <option value='QUALIFYING'>CLASSIFICATÓRIA</option>
            <option value='IN_PROGRESS'>EM ANDAMENTO</option>
            <option value='FINISHED'>ENCERRADO</option>
            <option value='CANCELED'>CANCELADO</option>
          </select>
          <button className='cc-btn-outline' onClick={async () => {
            const ok = await confirm({
              title: 'Cancelar evento?',
              message: 'O evento será marcado como CANCELADO. O histórico (inscritos, chave, apostas) é preservado.',
              highlightText: event.name,
              danger: true, confirmLabel: 'Sim, cancelar',
            });
            if (!ok) return;
            void submit('Cancelar evento', () => adminJson(`/admin/category-events/${event.id}`, { method: 'DELETE' }), 'list');
          }}>Cancelar evento</button>
          <button className='cc-btn-danger' onClick={async () => {
            const ok = await confirm({
              title: 'Excluir evento DEFINITIVAMENTE?',
              message: 'Esta ação remove o evento, todos os inscritos, a chave e os mercados ainda não apostados. Não pode ser desfeita. Se já houver apostas registradas, use "Cancelar evento" ou "Excluir forçado".',
              highlightText: event.name,
              danger: true, confirmLabel: 'Sim, excluir',
            });
            if (!ok) return;
            void submit(
              'Excluir evento',
              () => adminJson(`/admin/category-events/${event.id}/hard`, { method: 'DELETE' }),
              'list',
            ).then(() => onDeleted());
          }}>Excluir definitivamente</button>
          <button className='cc-btn-danger' style={{ borderColor: 'rgba(239,68,68,0.6)', background: 'rgba(239,68,68,0.25)' }} onClick={async () => {
            const ok = await confirm({
              title: 'EXCLUIR FORÇADO?',
              message: 'Anula TODAS as apostas vinculadas a este evento (incluindo as auditadas) e remove o evento, mercados, duels e bilhetes. As carteiras dos apostadores são revertidas ao saldo pré-aposta. Use só para eventos de TESTE.',
              highlightText: event.name,
              danger: true, confirmLabel: 'Sim, excluir forçado',
            });
            if (!ok) return;
            void submit(
              'Excluir evento (forçado)',
              () => adminJson(`/admin/category-events/${event.id}/hard?force=true`, { method: 'DELETE' }),
              'list',
            ).then(() => onDeleted());
          }}>Excluir forçado</button>
        </div>
      </div>
    </div>
  );
}

function AddCategoryButton({ event, submit, adminJson }: { event: CategoryEvent; submit: SubmitFn; adminJson: JsonFn }) {
  const existing = new Set(event.brackets.map((b) => b.category));
  const available = CATEGORIES.filter((c) => !existing.has(c.value));
  if (!available.length) return null;
  return (
    <select
      className='cc-field max-w-[180px] ml-1'
      defaultValue=''
      onChange={(e) => {
        const cat = e.target.value;
        if (!cat) return;
        void submit('Adicionar categoria', () =>
          adminJson(`/admin/category-events/${event.id}/brackets`, {
            method: 'POST', body: JSON.stringify({ category: cat, size: 8 }),
          }),
        );
        e.target.value = '';
      }}
    >
      <option value=''>+ Adicionar categoria...</option>
      {available.map((c) => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
    </select>
  );
}

function CompetitorsPanel({ bracket, submit, adminJson, confirm }: { bracket: Bracket; submit: SubmitFn; adminJson: JsonFn; confirm: ConfirmFn }) {
  const [form, setForm] = useState({ driverName: '', driverNickname: '', carName: '', carNumber: '', driverTeam: '', qualifyingReaction: '', qualifyingTrack: '' });
  const meta = CATEGORIES.find((c) => c.value === bracket.category);

  return (
    <div className='space-y-4'>
      <div className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
        <h3 className='text-sm font-semibold'>Inscrever piloto na categoria {meta?.label}</h3>
        {meta?.minTime !== null && (
          <p className='mt-1 text-[11px] text-amber-400'>⚠️ Tempo mínimo desta categoria: {meta?.minTime}s — passadas abaixo são invalidadas.</p>
        )}
        <form
          className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.driverName) { return; }
            void submit('Inscrever piloto', () =>
              adminJson(`/admin/category-events/brackets/${bracket.id}/competitors`, {
                method: 'POST',
                body: JSON.stringify({
                  driverName: form.driverName,
                  driverNickname: form.driverNickname || undefined,
                  carName: form.carName || undefined,
                  carNumber: form.carNumber || undefined,
                  driverTeam: form.driverTeam || undefined,
                  qualifyingReaction: form.qualifyingReaction ? Number(form.qualifyingReaction) : undefined,
                  qualifyingTrack: form.qualifyingTrack ? Number(form.qualifyingTrack) : undefined,
                }),
              }),
            );
            setForm({ driverName: '', driverNickname: '', carName: '', carNumber: '', driverTeam: '', qualifyingReaction: '', qualifyingTrack: '' });
          }}
        >
          <input className='cc-field' placeholder='Nome do piloto' value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} />
          <input className='cc-field' placeholder='Apelido (opc)' value={form.driverNickname} onChange={(e) => setForm({ ...form, driverNickname: e.target.value })} />
          <input className='cc-field' placeholder='Equipe (opc)' value={form.driverTeam} onChange={(e) => setForm({ ...form, driverTeam: e.target.value })} />
          <input className='cc-field' placeholder='Nome do carro (opc)' value={form.carName} onChange={(e) => setForm({ ...form, carName: e.target.value })} />
          <input className='cc-field' placeholder='Nº do carro (opc)' value={form.carNumber} onChange={(e) => setForm({ ...form, carNumber: e.target.value })} />
          <input className='cc-field' type='number' step='0.001' placeholder='Reação class. (s)' value={form.qualifyingReaction} onChange={(e) => setForm({ ...form, qualifyingReaction: e.target.value })} />
          <input className='cc-field' type='number' step='0.001' placeholder='Tempo pista class. (s)' value={form.qualifyingTrack} onChange={(e) => setForm({ ...form, qualifyingTrack: e.target.value })} />
          <button type='submit' className='cc-btn-primary lg:col-span-3'>Inscrever piloto</button>
        </form>
      </div>

      <div className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
        <div className='flex items-center justify-between mb-3'>
          <h3 className='text-sm font-semibold'>Inscritos ({bracket.competitors.length})</h3>
          <p className='text-[10px] text-white/40'>Ordenar por classificatória (Reação + Pista)</p>
        </div>
        <div className='space-y-2'>
          {bracket.competitors
            .slice()
            .sort((a, b) => Number(a.qualifyingTotal ?? 999) - Number(b.qualifyingTotal ?? 999))
            .map((c, idx) => (
              <div key={c.id} className='flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2'>
                <span className='inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-xs font-bold'>{idx + 1}º</span>
                <div className='flex-1 min-w-0'>
                  <p className='text-sm font-medium truncate'>{c.driver.name} {c.driver.nickname && <span className='text-white/40'>({c.driver.nickname})</span>}</p>
                  <p className='text-[10px] text-white/40 truncate'>
                    {c.carName || '— sem carro'}{c.carNumber ? ` #${c.carNumber}` : ''}{c.driver.team ? ` · ${c.driver.team}` : ''}
                  </p>
                </div>
                <div className='text-right text-[11px] font-mono text-white/70'>
                  {c.qualifyingReaction !== null && <p>R: {Number(c.qualifyingReaction).toFixed(3)}s</p>}
                  {c.qualifyingTrack !== null && <p>P: {Number(c.qualifyingTrack).toFixed(3)}s</p>}
                  {c.qualifyingTotal !== null && <p className='text-emerald-400 font-bold'>T: {Number(c.qualifyingTotal).toFixed(3)}s</p>}
                </div>
                <button className='cc-btn-danger' onClick={async () => {
                  const ok = await confirm({
                    title: 'Remover inscrito?',
                    message: 'O competidor será removido desta categoria.',
                    highlightText: c.driver.name,
                    danger: true, confirmLabel: 'Sim, remover',
                  });
                  if (!ok) return;
                  void submit('Remover inscrito', () => adminJson(`/admin/category-events/competitors/${c.id}`, { method: 'DELETE' }));
                }}>×</button>
              </div>
            ))}
          {!bracket.competitors.length && <p className='text-sm text-white/40 text-center py-6'>Sem inscritos ainda.</p>}
        </div>
      </div>
    </div>
  );
}

function BracketBuilder({ bracket, submit, adminJson, confirm }: { bracket: Bracket; submit: SubmitFn; adminJson: JsonFn; confirm: ConfirmFn }) {
  const size = Math.max(2, bracket.size);
  // Round 1 = N/2 matchups (N = size). Build the layout state from existing matchups + draft state.
  type Slot = { roundNumber: number; position: number; leftCompetitorId: string | null; rightCompetitorId: string | null };

  // Inicializa TODAS as rodadas (1, 2, ... finais) para garantir que o save persiste estrutura completa
  const buildInitialSlots = (): Slot[] => {
    const map = new Map<string, Slot>();
    const totalRounds = Math.max(1, Math.ceil(Math.log2(size)));
    for (let r = 1; r <= totalRounds; r++) {
      const expected = Math.ceil(size / Math.pow(2, r));
      for (let i = 0; i < expected; i++) {
        map.set(`${r}-${i}`, { roundNumber: r, position: i, leftCompetitorId: null, rightCompetitorId: null });
      }
    }
    // Sobrescreve com matchups existentes (Super Final é gerida por aba própria,
    // tem roundNumber=99 e não deve aparecer nem ser regravada aqui)
    for (const m of bracket.matchups) {
      if (m.isSuperFinal) continue;
      map.set(`${m.roundNumber}-${m.position}`, {
        roundNumber: m.roundNumber, position: m.position,
        leftCompetitorId: m.leftCompetitorId, rightCompetitorId: m.rightCompetitorId,
      });
    }
    return Array.from(map.values());
  };

  const [slots, setSlots] = useState<Slot[]>(() => buildInitialSlots());

  const [dirty, setDirty] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Reset state when bracket changes
  useEffect(() => {
    setSlots(buildInitialSlots());
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bracket.id, bracket.size]);

  // Set of competitor IDs already placed in any slot
  const placedIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of slots) {
      if (s.leftCompetitorId) set.add(s.leftCompetitorId);
      if (s.rightCompetitorId) set.add(s.rightCompetitorId);
    }
    return set;
  }, [slots]);

  const unplacedCompetitors = bracket.competitors.filter((c) => !placedIds.has(c.id));
  const round1Slots = slots.filter((s) => s.roundNumber === 1).sort((a, b) => a.position - b.position);

  function handleDrop(roundNumber: number, position: number, side: 'LEFT' | 'RIGHT') {
    if (!draggingId) return;
    setSlots((prev) => prev.map((s) => {
      // remove from any slot first
      const cleaned = {
        ...s,
        leftCompetitorId: s.leftCompetitorId === draggingId ? null : s.leftCompetitorId,
        rightCompetitorId: s.rightCompetitorId === draggingId ? null : s.rightCompetitorId,
      };
      if (s.roundNumber === roundNumber && s.position === position) {
        return {
          ...cleaned,
          [side === 'LEFT' ? 'leftCompetitorId' : 'rightCompetitorId']: draggingId,
        };
      }
      return cleaned;
    }));
    setDirty(true);
    setDraggingId(null);
  }

  function clearSlot(roundNumber: number, position: number, side: 'LEFT' | 'RIGHT') {
    setSlots((prev) => prev.map((s) => {
      if (s.roundNumber === roundNumber && s.position === position) {
        return { ...s, [side === 'LEFT' ? 'leftCompetitorId' : 'rightCompetitorId']: null };
      }
      return s;
    }));
    setDirty(true);
  }

  async function saveLayout() {
    const ok = await confirm({
      title: 'Salvar chave do evento?',
      message: 'A chave atual será salva. Confrontos pendentes (não auditados) serão substituídos pela disposição mostrada.',
      confirmLabel: 'Sim, salvar',
    });
    if (!ok) return;
    void submit('Salvar chave', () =>
      adminJson(`/admin/category-events/brackets/${bracket.id}/layout`, {
        method: 'POST', body: JSON.stringify({ slots }),
      }),
    );
  }

  return (
    <div className='space-y-3 sm:space-y-4'>
      <div className='rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-5'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3'>
          <div className='min-w-0'>
            <h3 className='text-sm font-semibold'>Chave do Evento — {CATEGORIES.find((c) => c.value === bracket.category)?.label}</h3>
            <p className='text-[11px] text-white/40 mt-0.5'>
              <span className='hidden sm:inline'>Arraste pilotos para os slots ou </span>
              <span>Toque no piloto e depois no slot para posicionar.</span>
            </p>
          </div>
          <div className='flex gap-2 shrink-0'>
            <select
              className='cc-field flex-1 sm:max-w-[140px] text-xs sm:text-sm'
              value={size}
              onChange={(e) => {
                const newSize = Number(e.target.value);
                void submit('Atualizar tamanho', () =>
                  adminJson(`/admin/category-events/brackets/${bracket.id}/size`, {
                    method: 'PATCH', body: JSON.stringify({ size: newSize }),
                  }),
                );
              }}
            >
              <option value='2'>2 pilotos</option>
              <option value='4'>4 pilotos</option>
              <option value='8'>8 pilotos</option>
              <option value='16'>16 pilotos</option>
              <option value='32'>32 pilotos</option>
            </select>
            <button
              type='button'
              onClick={() => void saveLayout()}
              disabled={!dirty}
              className={`cc-btn-primary whitespace-nowrap ${!dirty ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              💾 Salvar
            </button>
          </div>
        </div>
        {draggingId && (
          <div className='rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 mt-2'>
            🎯 Piloto selecionado — toque em um slot da chave para posicionar (ou toque novamente no piloto para cancelar).
          </div>
        )}
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3 sm:gap-4'>
        {/* Pool of unplaced competitors */}
        <div className='rounded-2xl border border-white/10 bg-[#101525] p-3 sm:p-4'>
          <h4 className='text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2'>Pilotos disponíveis ({unplacedCompetitors.length})</h4>
          <div className='grid grid-cols-2 lg:grid-cols-1 gap-1.5 max-h-[40vh] lg:max-h-[60vh] overflow-auto'>
            {unplacedCompetitors.map((c) => (
              <button
                key={c.id}
                type='button'
                draggable
                onDragStart={() => setDraggingId(c.id)}
                onDragEnd={() => setDraggingId(null)}
                onClick={() => setDraggingId(draggingId === c.id ? null : c.id)}
                className={`text-left cursor-pointer active:scale-[0.98] rounded-lg border p-2 text-xs transition-all ${draggingId === c.id ? 'border-amber-500/70 bg-amber-500/15 ring-2 ring-amber-500/30' : 'border-white/10 bg-white/[0.03] hover:border-white/30'}`}
              >
                <p className='font-semibold truncate'>{c.driver.name}</p>
                <p className='text-[10px] text-white/40 truncate'>{c.carName}{c.carNumber ? ` #${c.carNumber}` : ''}</p>
              </button>
            ))}
            {!unplacedCompetitors.length && <p className='col-span-2 lg:col-span-1 text-[11px] text-white/30 italic text-center py-4'>Todos alocados</p>}
          </div>
        </div>

        {/* Bracket */}
        <div className='rounded-2xl border border-white/10 bg-[#101525] p-4 overflow-x-auto'>
          <div className='flex gap-8 items-start min-w-fit'>
            {Array.from({ length: getRounds(size) }, (_, i) => i + 1).map((roundNumber) => {
              const roundSlots = slots
                .filter((s) => s.roundNumber === roundNumber)
                .sort((a, b) => a.position - b.position);
              const expectedSlots = Math.ceil(size / Math.pow(2, roundNumber));
              while (roundSlots.length < expectedSlots) {
                const pos = roundSlots.length;
                roundSlots.push({ roundNumber, position: pos, leftCompetitorId: null, rightCompetitorId: null });
              }

              const roundLabel = roundNumber === 1 ? 'Rodada 1' : roundNumber === getRounds(size) ? '🏆 Final' : `Rodada ${roundNumber}`;

              return (
                <div key={roundNumber} className='flex flex-col gap-3 min-w-[200px]'>
                  <p className='text-[10px] font-bold uppercase tracking-widest text-white/40 text-center'>{roundLabel}</p>
                  <div className='flex flex-col justify-around flex-1' style={{ gap: roundNumber === 1 ? '8px' : `${roundNumber * 24}px` }}>
                    {roundSlots.map((slot) => {
                      const matchup = bracket.matchups.find((m) => m.roundNumber === slot.roundNumber && m.position === slot.position);
                      return (
                        <BracketSlot
                          key={`${slot.roundNumber}-${slot.position}`}
                          slot={slot}
                          competitors={bracket.competitors}
                          matchup={matchup}
                          isFirstRound={roundNumber === 1}
                          onDrop={handleDrop}
                          onClear={clearSlot}
                          onToggleMarket={async () => {
                            if (!matchup) return;
                            const action = matchup.marketOpen ? 'Fechar' : 'Abrir';
                            void submit(`${action} apostas`, () =>
                              adminJson(`/admin/category-events/matchups/${matchup.id}/market`, {
                                method: 'PATCH', body: JSON.stringify({ open: !matchup.marketOpen }),
                              }),
                            );
                          }}
                          onSettle={async (winnerSide) => {
                            if (!matchup) return;
                            const left = bracket.competitors.find((c) => c.id === slot.leftCompetitorId);
                            const right = bracket.competitors.find((c) => c.id === slot.rightCompetitorId);
                            const winner = winnerSide === 'LEFT' ? left : right;
                            if (!winner) return;
                            const ok = await confirm({
                              title: 'Auditar vencedor?',
                              message: matchup.marketOpen
                                ? 'Apostas serao liquidadas e creditadas aos vencedores. Acao IMUTAVEL.'
                                : 'Esta acao fixa o vencedor desta passada (sem apostas vinculadas).',
                              highlightText: `🏆 ${winner.driver.name}`,
                              confirmLabel: 'Sim, auditar',
                            });
                            if (!ok) return;
                            void submit('Auditar vencedor', () =>
                              adminJson(`/admin/category-events/matchups/${matchup.id}/settle`, {
                                method: 'POST', body: JSON.stringify({ winnerSide }),
                              }),
                            );
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function getRounds(size: number): number {
  return Math.max(1, Math.ceil(Math.log2(size)));
}

function BracketSlot({
  slot, competitors, matchup, isFirstRound, onDrop, onClear, onSettle, onToggleMarket,
}: {
  slot: { roundNumber: number; position: number; leftCompetitorId: string | null; rightCompetitorId: string | null };
  competitors: Competitor[];
  matchup?: Matchup;
  isFirstRound: boolean;
  onDrop: (round: number, pos: number, side: 'LEFT' | 'RIGHT') => void;
  onClear: (round: number, pos: number, side: 'LEFT' | 'RIGHT') => void;
  onSettle: (side: 'LEFT' | 'RIGHT') => void;
  onToggleMarket: () => void;
}) {
  const left = slot.leftCompetitorId ? competitors.find((c) => c.id === slot.leftCompetitorId) : null;
  const right = slot.rightCompetitorId ? competitors.find((c) => c.id === slot.rightCompetitorId) : null;
  const settled = matchup?.winnerSide;
  const canOpenMarket = !!matchup && !settled && !!left && !!right;

  return (
    <div className={`rounded-lg border overflow-hidden ${settled ? 'border-emerald-500/30 bg-emerald-500/5' : matchup?.marketOpen ? 'border-blue-500/30 bg-blue-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
      {matchup?.marketOpen && !settled && (
        <div className='bg-blue-500/20 px-2 py-0.5 text-center text-[9px] font-bold text-blue-300 uppercase tracking-wider'>
          🟢 Apostas abertas
        </div>
      )}
      <SlotSide
        side='LEFT' competitor={left} isWinner={settled === 'LEFT'} canDrop={isFirstRound && !settled}
        onPlace={() => onDrop(slot.roundNumber, slot.position, 'LEFT')}
        onClear={() => onClear(slot.roundNumber, slot.position, 'LEFT')}
        onSettleClick={() => onSettle('LEFT')}
        canAudit={!!matchup && !settled && !!left && !!right}
      />
      <div className='border-t border-white/5' />
      <SlotSide
        side='RIGHT' competitor={right} isWinner={settled === 'RIGHT'} canDrop={isFirstRound && !settled}
        onPlace={() => onDrop(slot.roundNumber, slot.position, 'RIGHT')}
        onClear={() => onClear(slot.roundNumber, slot.position, 'RIGHT')}
        onSettleClick={() => onSettle('RIGHT')}
        canAudit={!!matchup && !settled && !!left && !!right}
      />
      {canOpenMarket && (
        <button
          type='button'
          onClick={onToggleMarket}
          className={`w-full text-[10px] font-bold py-1 ${matchup.marketOpen ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'}`}
        >
          {matchup.marketOpen ? '⏸ Fechar apostas' : '🚀 Abrir apostas'}
        </button>
      )}
    </div>
  );
}

function SlotSide({
  side, competitor, isWinner, canDrop, onPlace, onClear, onSettleClick, canAudit,
}: {
  side: 'LEFT' | 'RIGHT';
  competitor: Competitor | null | undefined;
  isWinner: boolean;
  canDrop: boolean;
  onPlace: () => void;
  onClear: () => void;
  onSettleClick: () => void;
  canAudit: boolean;
}) {
  return (
    <div
      onDragOver={(e) => { if (canDrop) { e.preventDefault(); e.currentTarget.classList.add('bg-amber-500/10'); } }}
      onDragLeave={(e) => { e.currentTarget.classList.remove('bg-amber-500/10'); }}
      onDrop={(e) => { e.currentTarget.classList.remove('bg-amber-500/10'); if (canDrop) onPlace(); }}
      onClick={() => { if (canDrop) onPlace(); }}
      className={`flex items-center px-2 py-2 min-h-[44px] ${isWinner ? 'bg-emerald-500/15' : ''} ${canDrop ? 'hover:bg-white/[0.04] cursor-copy active:bg-amber-500/10' : ''}`}
    >
      <div className='flex-1 min-w-0'>
        {competitor ? (
          <>
            <p className={`text-xs font-semibold truncate ${isWinner ? 'text-emerald-300' : 'text-white/90'}`}>
              {isWinner && '🏆 '}{competitor.driver.name}
            </p>
            <p className='text-[10px] text-white/40 truncate'>{competitor.carName}{competitor.carNumber ? ` #${competitor.carNumber}` : ''}</p>
          </>
        ) : (
          <p className='text-[10px] italic text-white/30'>{canDrop ? 'Toque/solte aqui' : '—'}</p>
        )}
      </div>
      {competitor && canDrop && !isWinner && (
        <button onClick={(e) => { e.stopPropagation(); onClear(); }} className='ml-1 text-white/30 hover:text-red-400 text-sm w-6 h-6 flex items-center justify-center'>×</button>
      )}
      {canAudit && (
        <button onClick={(e) => { e.stopPropagation(); onSettleClick(); }} className='ml-1 rounded bg-emerald-500/20 hover:bg-emerald-500/40 px-2 py-1 text-[10px] font-bold text-emerald-300' title='Auditar vencedor'>
          🏆
        </button>
      )}
    </div>
  );
}

// ─── Super Final ───────────────────────────────────────────
// Cada categoria pode ter UMA Super Final montada manualmente após as rodadas
// normais. Os dois pilotos podem vir dos inscritos (autocomplete) ou ser
// digitados livremente — neste caso o backend cria/encontra o Driver e
// inscreve como CategoryCompetitor da chave.
type DriverPick = { driverId?: string; driverName: string; driverNickname?: string; carName?: string; carNumber?: string; driverTeam?: string };

function SuperFinalPanel({ bracket, submit, adminJson, confirm }: { bracket: Bracket; submit: SubmitFn; adminJson: JsonFn; confirm: ConfirmFn }) {
  const meta = CATEGORIES.find((c) => c.value === bracket.category);
  const existing = bracket.matchups.find((m) => m.isSuperFinal);
  const settled = !!existing?.winnerSide && !!existing?.settledAt;

  const initialFor = (competitorId: string | null | undefined): DriverPick => {
    if (!competitorId) return { driverName: '' };
    const c = bracket.competitors.find((x) => x.id === competitorId);
    if (!c) return { driverName: '' };
    return {
      driverId: c.driverId,
      driverName: c.driver.name,
      driverNickname: c.driver.nickname ?? undefined,
      carName: c.carName ?? undefined,
      carNumber: c.carNumber ?? undefined,
      driverTeam: c.driver.team ?? undefined,
    };
  };

  const [left, setLeft] = useState<DriverPick>(() => initialFor(existing?.leftCompetitorId));
  const [right, setRight] = useState<DriverPick>(() => initialFor(existing?.rightCompetitorId));

  // Reset quando troca de chave
  useEffect(() => {
    setLeft(initialFor(existing?.leftCompetitorId));
    setRight(initialFor(existing?.rightCompetitorId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bracket.id, existing?.id]);

  const leftCompetitor = existing?.leftCompetitorId ? bracket.competitors.find((c) => c.id === existing.leftCompetitorId) : null;
  const rightCompetitor = existing?.rightCompetitorId ? bracket.competitors.find((c) => c.id === existing.rightCompetitorId) : null;

  function payloadSide(p: DriverPick) {
    if (p.driverId) {
      return {
        driverId: p.driverId,
        carName: p.carName || undefined,
        carNumber: p.carNumber || undefined,
      };
    }
    return {
      driverName: p.driverName.trim(),
      driverNickname: p.driverNickname || undefined,
      carName: p.carName || undefined,
      carNumber: p.carNumber || undefined,
      driverTeam: p.driverTeam || undefined,
    };
  }

  async function save(openMarket: boolean) {
    const lname = left.driverName.trim();
    const rname = right.driverName.trim();
    if (!lname || !rname) return;
    if (left.driverId && right.driverId && left.driverId === right.driverId) return;

    if (openMarket) {
      const ok = await confirm({
        title: 'Salvar e abrir mercado?',
        message: `A Super Final será criada e o mercado será aberto para apostas imediatamente.`,
        highlightText: `${lname} × ${rname}`,
        confirmLabel: 'Sim, abrir mercado',
      });
      if (!ok) return;
    }

    void submit('Salvar Super Final', () =>
      adminJson(`/admin/category-events/brackets/${bracket.id}/super-final`, {
        method: 'POST',
        body: JSON.stringify({
          left: payloadSide(left),
          right: payloadSide(right),
          openMarket,
        }),
      }),
    );
  }

  async function toggleMarket() {
    if (!existing) return;
    const action = existing.marketOpen ? 'Fechar' : 'Abrir';
    void submit(`${action} apostas`, () =>
      adminJson(`/admin/category-events/matchups/${existing.id}/market`, {
        method: 'PATCH', body: JSON.stringify({ open: !existing.marketOpen }),
      }),
    );
  }

  async function settleSide(winnerSide: 'LEFT' | 'RIGHT') {
    if (!existing || !leftCompetitor || !rightCompetitor) return;
    const winner = winnerSide === 'LEFT' ? leftCompetitor : rightCompetitor;
    const ok = await confirm({
      title: 'Auditar vencedor da Super Final?',
      message: existing.marketOpen
        ? 'Apostas serão liquidadas e creditadas aos vencedores. Ação IMUTÁVEL.'
        : 'Esta ação fixa o vencedor desta Super Final (sem apostas vinculadas).',
      highlightText: `🏆 ${winner.driver.name}`,
      confirmLabel: 'Sim, auditar',
    });
    if (!ok) return;
    void submit('Auditar Super Final', () =>
      adminJson(`/admin/category-events/matchups/${existing.id}/settle`, {
        method: 'POST', body: JSON.stringify({ winnerSide }),
      }),
    );
  }

  return (
    <div className='space-y-4'>
      <div className='rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-600/5 p-4 sm:p-5'>
        <div className='flex items-start justify-between gap-3 mb-2'>
          <div className='min-w-0'>
            <p className='text-[10px] font-bold uppercase tracking-widest text-amber-400'>⭐ Super Final · {meta?.label}</p>
            <h3 className='mt-1 text-base sm:text-lg font-bold'>Top 2 da categoria — final do campeonato</h3>
            <p className='mt-1 text-xs text-white/60'>
              Escolha os dois pilotos que disputarão a Super Final desta categoria. Use a busca por nome
              {bracket.competitors.length > 0 && ` (sugestões: ${bracket.competitors.length} inscritos)`}
              {' '}— se digitar um nome novo, o piloto é criado automaticamente.
            </p>
          </div>
          {existing && (
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
              settled ? 'bg-emerald-500/20 text-emerald-300'
                : existing.marketOpen ? 'bg-blue-500/20 text-blue-300'
                : 'bg-white/10 text-white/60'
            }`}>
              {settled ? '✅ Auditada' : existing.marketOpen ? '🟢 Apostas abertas' : '⏸ Pendente'}
            </span>
          )}
        </div>
      </div>

      {/* Pickers */}
      <div className='grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-stretch'>
        <DriverPickerCard label='Lado 1' value={left} onChange={setLeft} suggestions={bracket.competitors} disabled={settled} />
        <div className='flex items-center justify-center text-2xl font-bold text-amber-400 lg:px-2'>×</div>
        <DriverPickerCard label='Lado 2' value={right} onChange={setRight} suggestions={bracket.competitors} disabled={settled} />
      </div>

      {/* Actions */}
      {!settled && (
        <div className='flex flex-wrap gap-2'>
          <button
            type='button'
            disabled={!left.driverName.trim() || !right.driverName.trim()}
            onClick={() => void save(false)}
            className='cc-btn-outline disabled:opacity-50 disabled:cursor-not-allowed'
          >
            💾 Salvar Super Final
          </button>
          <button
            type='button'
            disabled={!left.driverName.trim() || !right.driverName.trim()}
            onClick={() => void save(true)}
            className='cc-btn-primary disabled:opacity-50 disabled:cursor-not-allowed bg-amber-400 text-black hover:bg-amber-300'
          >
            🚀 Salvar e abrir mercado
          </button>
          {existing && (
            <button type='button' onClick={() => void toggleMarket()} className='cc-btn-outline'>
              {existing.marketOpen ? '⏸ Fechar apostas' : '🟢 Abrir apostas'}
            </button>
          )}
        </div>
      )}

      {/* Existing matchup info + audit */}
      {existing && leftCompetitor && rightCompetitor && (
        <div className='rounded-2xl border border-white/10 bg-[#101525] p-4'>
          <p className='text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3'>Confronto atual</p>
          <div className='grid grid-cols-2 gap-3'>
            <div className={`rounded-xl border p-3 ${existing.winnerSide === 'LEFT' ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <p className='text-[10px] uppercase tracking-wider text-white/40'>Lado 1</p>
              <p className='mt-1 text-sm font-semibold truncate'>
                {existing.winnerSide === 'LEFT' && '🏆 '}{leftCompetitor.driver.name}
              </p>
              <p className='text-[10px] text-white/40 truncate'>{leftCompetitor.carName || '—'}{leftCompetitor.carNumber ? ` #${leftCompetitor.carNumber}` : ''}</p>
              {!settled && (
                <button onClick={() => void settleSide('LEFT')} className='mt-2 w-full rounded bg-emerald-500/20 hover:bg-emerald-500/40 px-2 py-1.5 text-[11px] font-bold text-emerald-300'>
                  🏆 Vencedor
                </button>
              )}
            </div>
            <div className={`rounded-xl border p-3 ${existing.winnerSide === 'RIGHT' ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <p className='text-[10px] uppercase tracking-wider text-white/40'>Lado 2</p>
              <p className='mt-1 text-sm font-semibold truncate'>
                {existing.winnerSide === 'RIGHT' && '🏆 '}{rightCompetitor.driver.name}
              </p>
              <p className='text-[10px] text-white/40 truncate'>{rightCompetitor.carName || '—'}{rightCompetitor.carNumber ? ` #${rightCompetitor.carNumber}` : ''}</p>
              {!settled && (
                <button onClick={() => void settleSide('RIGHT')} className='mt-2 w-full rounded bg-emerald-500/20 hover:bg-emerald-500/40 px-2 py-1.5 text-[11px] font-bold text-emerald-300'>
                  🏆 Vencedor
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DriverPickerCard({
  label, value, onChange, suggestions, disabled,
}: {
  label: string;
  value: DriverPick;
  onChange: (next: DriverPick) => void;
  suggestions: Competitor[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const term = value.driverName.trim().toLowerCase();
  const filtered = term
    ? suggestions.filter((c) => c.driver.name.toLowerCase().includes(term)).slice(0, 8)
    : suggestions.slice(0, 8);

  function pickCompetitor(c: Competitor) {
    onChange({
      driverId: c.driverId,
      driverName: c.driver.name,
      driverNickname: c.driver.nickname ?? undefined,
      carName: c.carName ?? undefined,
      carNumber: c.carNumber ?? undefined,
      driverTeam: c.driver.team ?? undefined,
    });
    setOpen(false);
  }

  function clearPick() {
    onChange({ driverName: '' });
  }

  return (
    <div className='rounded-2xl border border-white/10 bg-[#101525] p-4'>
      <p className='text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2'>{label}</p>
      <div className='relative'>
        <input
          className='cc-field'
          placeholder='Buscar piloto pelo nome…'
          value={value.driverName}
          disabled={disabled}
          onChange={(e) => {
            // Limpa driverId se o texto não corresponde mais à seleção
            const text = e.target.value;
            onChange({ ...value, driverName: text, driverId: undefined });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {value.driverId && !disabled && (
          <button
            type='button'
            onClick={clearPick}
            title='Limpar seleção'
            className='absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-red-400 text-sm'
          >
            ×
          </button>
        )}
        {open && filtered.length > 0 && !disabled && (
          <div className='absolute left-0 right-0 top-full mt-1 z-10 max-h-60 overflow-auto rounded-xl border border-white/15 bg-[#0c0f1a] shadow-2xl'>
            {filtered.map((c) => (
              <button
                key={c.id}
                type='button'
                onMouseDown={(e) => { e.preventDefault(); pickCompetitor(c); }}
                className='block w-full text-left px-3 py-2 text-xs hover:bg-white/5 border-b border-white/5 last:border-0'
              >
                <p className='font-semibold truncate'>{c.driver.name}</p>
                <p className='text-[10px] text-white/40 truncate'>
                  {c.carName || '—'}{c.carNumber ? ` #${c.carNumber}` : ''}{c.driver.team ? ` · ${c.driver.team}` : ''}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
      {value.driverId ? (
        <p className='mt-2 text-[10px] text-emerald-400'>✓ Inscrito da categoria</p>
      ) : value.driverName.trim() ? (
        <p className='mt-2 text-[10px] text-amber-400'>⚠️ Piloto novo — será criado e inscrito</p>
      ) : (
        <p className='mt-2 text-[10px] text-white/30'>Digite o nome para buscar ou criar</p>
      )}
      <div className='mt-3 grid grid-cols-2 gap-2'>
        <input
          className='cc-field'
          placeholder='Carro (opc)'
          value={value.carName ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, carName: e.target.value })}
        />
        <input
          className='cc-field'
          placeholder='Nº (opc)'
          value={value.carNumber ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, carNumber: e.target.value })}
        />
      </div>
    </div>
  );
}
