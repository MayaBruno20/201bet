'use client';

import * as React from 'react';
import { I } from '@admin/components/ui/icons';
import { Page, Card, StatusChip } from '@admin/components/ui/primitives';
import { useToast } from '@admin/components/ui/toast';
import { useConfirm } from '@admin/components/ui/confirm';
import { DatePicker } from '@admin/components/ui/datepicker';
import { api, apiUpload, getApiBaseUrl } from '@admin/lib/api';
import { ENDPOINTS } from '@admin/lib/endpoints';
import { getPublicSiteUrl } from '@/lib/env-public';

type DriverLite = { id: string; name: string; isGuest: boolean };
type CarLite = {
  id: string;
  name: string;
  number: string | null;
  photoUrl: string | null;
  driver: DriverLite;
};

type CustomDuel = {
  id: string;
  status: 'SCHEDULED' | 'BOOKING_OPEN' | 'BOOKING_CLOSED' | 'FINISHED' | 'CANCELED';
  startsAt: string;
  bookingCloseAt: string;
  customTitle: string | null;
  bannerUrl: string | null;
  isFeatured: boolean;
  notes: string | null;
  event: { id: string; name: string } | null;
  leftCar: CarLite;
  rightCar: CarLite;
  market: {
    id: string;
    status: string;
    winnerOddId: string | null;
    odds: Array<{ id: string; label: string; value: number; status: string }>;
  } | null;
  pool: { left: number; right: number; tickets: number } | null;
  createdAt: string;
};

type BackendCar = {
  id: string;
  name: string;
  category: string;
  number: string | null;
  photoUrl: string | null;
  active: boolean;
  driver: { id: string; name: string };
};

type BackendEvent = { id: string; name: string; status: string; startAt: string };

const STATUS_LABEL: Record<CustomDuel['status'], string> = {
  SCHEDULED: 'Agendado',
  BOOKING_OPEN: 'Mercado aberto',
  BOOKING_CLOSED: 'Mercado fechado',
  FINISHED: 'Auditado',
  CANCELED: 'Cancelado',
};

const ASSET_BASE = (() => {
  const base = getApiBaseUrl();
  return base.replace(/\/api\/?$/, '');
})();

function resolveAsset(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${ASSET_BASE}${url}`;
}

function buildShareLink(duel: { id: string; event: { id: string } | null }): string {
  const site = getPublicSiteUrl();
  const params = new URLSearchParams({ duelId: duel.id });
  if (duel.event?.id) params.set('eventId', duel.event.id);
  return `${site}/apostas?${params.toString()}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fallthrough */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

export default function PersonalizadosPage() {
  const [duels, setDuels] = React.useState<CustomDuel[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editFor, setEditFor] = React.useState<CustomDuel | null>(null);
  const [settleFor, setSettleFor] = React.useState<CustomDuel | null>(null);
  const { push } = useToast();
  const confirm = useConfirm();

  const load = React.useCallback(async () => {
    setLoading(true);
    try { setDuels(await api.get<CustomDuel[]>(ENDPOINTS.CUSTOM_DUELS.list)); }
    catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setLoading(false); }
  }, [push]);
  React.useEffect(() => { void load(); }, [load]);

  const closeBooking = async (d: CustomDuel) => {
    const ok = await confirm({
      title: 'Fechar mercado?',
      body: <>Apostas no embate <strong>{d.customTitle || `${d.leftCar.driver.name} × ${d.rightCar.driver.name}`}</strong> serão suspensas.</>,
      tone: 'warning',
      confirmLabel: 'Fechar mercado',
      icon: 'Pause',
    });
    if (!ok) return;
    setBusy(d.id);
    try {
      await api.post(ENDPOINTS.CUSTOM_DUELS.closeBooking(d.id));
      push({ title: 'Mercado fechado', tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const copyShareLink = async (d: CustomDuel) => {
    const link = buildShareLink(d);
    const ok = await copyToClipboard(link);
    push({
      title: ok ? 'Link copiado' : 'Falha ao copiar',
      body: link,
      tone: ok ? 'emerald' : 'rose',
    });
  };

  const cancel = async (d: CustomDuel) => {
    const ok = await confirm({
      title: 'Cancelar embate?',
      body: 'Apostas em aberto serão reembolsadas automaticamente.',
      tone: 'danger',
      confirmLabel: 'Cancelar embate',
      icon: 'AlertTriangle',
    });
    if (!ok) return;
    setBusy(d.id);
    try {
      await api.post(ENDPOINTS.CUSTOM_DUELS.cancel(d.id));
      push({ title: 'Embate cancelado', tone: 'amber' });
      await load();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(null); }
  };

  const open = duels.filter((d) => d.status === 'BOOKING_OPEN').length;
  const closed = duels.filter((d) => d.status === 'BOOKING_CLOSED').length;
  const settled = duels.filter((d) => d.status === 'FINISHED').length;
  const featured = duels.filter((d) => d.isFeatured && d.status !== 'CANCELED' && d.status !== 'FINISHED').length;

  return (
    <Page eyebrow="Operação · Embates personalizados" title="Embates Personalizados"
      sub="Embates marcados entre dois carros específicos, com banner próprio. Vinculados a um evento ou avulsos."
      actions={
        <>
          <button className="btn btn-ghost focusable" onClick={load}><I.Activity size={15}/> Atualizar</button>
          <button className="btn btn-primary focusable" onClick={() => setCreateOpen(true)}>
            <I.Plus size={15}/> Novo embate
          </button>
        </>
      }>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
        <Card className="p-4">
          <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Total</div>
          <div className="font-display text-[24px] font-bold mt-1 tabular-nums">{duels.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Em destaque</div>
          <div className="font-display text-[24px] font-bold mt-1 tabular-nums" style={{ color: '#ffc55a' }}>{featured}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Mercado aberto</div>
          <div className="font-display text-[24px] font-bold mt-1 tabular-nums" style={{ color: 'var(--emerald)' }}>{open}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Fechados</div>
          <div className="font-display text-[24px] font-bold mt-1 tabular-nums" style={{ color: 'var(--accent)' }}>{closed}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold text-[color:var(--text-3)]">Auditados</div>
          <div className="font-display text-[24px] font-bold mt-1 tabular-nums" style={{ color: 'var(--text-2)' }}>{settled}</div>
        </Card>
      </div>

      {loading && <Card className="p-12 text-center text-[13px] text-[color:var(--text-3)]">Carregando…</Card>}

      {!loading && duels.length === 0 && (
        <Card className="p-16 text-center">
          <div className="w-14 h-14 rounded-[14px] grid place-items-center mx-auto" style={{ background: 'var(--surface-2)' }}>
            <I.Sparkles size={22} style={{ color: 'var(--text-3)' }}/>
          </div>
          <div className="font-display text-[16px] font-semibold mt-3">Nenhum embate personalizado</div>
          <div className="text-[12.5px] text-[color:var(--text-3)] mt-1">Clique em "Novo embate" para criar o primeiro.</div>
        </Card>
      )}

      <div className="space-y-3">
        {duels.map((d) => {
          const banner = resolveAsset(d.bannerUrl);
          const title = d.customTitle || `${d.leftCar.driver.name} x ${d.rightCar.driver.name}`;
          return (
            <Card key={d.id} className="p-0 overflow-hidden">
              {banner && (
                <div className="relative w-full" style={{ aspectRatio: '5/1', background: 'var(--surface-2)' }}>
                  <img src={banner} alt={title} className="absolute inset-0 w-full h-full object-cover"/>
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)' }}/>
                  <div className="absolute left-3 bottom-2 right-3 flex items-end justify-between gap-2">
                    <div className="font-display text-[15px] font-bold text-white drop-shadow">{title}</div>
                    <StatusChip status={STATUS_LABEL[d.status]}/>
                  </div>
                </div>
              )}

              <div className="p-4">
                <div className="flex items-start gap-3 flex-wrap">
                  {!banner && (
                    <div className="w-11 h-11 rounded-[12px] grid place-items-center shrink-0"
                      style={{
                        background: d.status === 'BOOKING_OPEN' ? 'var(--emerald-soft)'
                          : d.status === 'FINISHED' ? 'var(--surface-3)'
                          : d.status === 'CANCELED' ? 'var(--rose-soft)'
                          : 'var(--accent-soft)',
                        color: d.status === 'BOOKING_OPEN' ? 'var(--emerald)'
                          : d.status === 'FINISHED' ? 'var(--text-2)'
                          : d.status === 'CANCELED' ? 'var(--rose)'
                          : 'var(--accent)',
                      }}>
                      <I.Sparkles size={18}/>
                    </div>
                  )}

                  <div className="flex-1 min-w-[260px]">
                    {!banner && (
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-display text-[14.5px] font-semibold">{title}</span>
                        <StatusChip status={STATUS_LABEL[d.status]}/>
                      </div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      {d.isFeatured && (
                        <span className="chip" style={{ background: 'rgba(255,197,90,0.15)', color: '#ffc55a' }}>
                          <I.Star size={10}/> EM DESTAQUE
                        </span>
                      )}
                      {d.event && (
                        <span className="chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                          <I.Trophy size={10}/> {d.event.name}
                        </span>
                      )}
                      {!d.event && (
                        <span className="chip" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                          Avulso · sem evento
                        </span>
                      )}
                      {d.market?.winnerOddId && (
                        <span className="chip" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
                          VENCEDOR · {d.market.odds.find((o) => o.id === d.market!.winnerOddId)?.label ?? ''}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <CarSide car={d.leftCar} won={d.market?.winnerOddId === d.market?.odds[0]?.id} alignRight/>
                      <div className="text-center text-[10.5px] font-bold tracking-[0.18em] uppercase" style={{ color: 'var(--text-3)' }}>VS</div>
                      <CarSide car={d.rightCar} won={d.market?.winnerOddId === d.market?.odds[1]?.id}/>
                    </div>

                    <div className="text-[11px] text-[color:var(--text-3)] mt-2">
                      Início: {new Date(d.startsAt).toLocaleString('pt-BR')}
                      {' · '}Fechamento: {new Date(d.bookingCloseAt).toLocaleString('pt-BR')}
                      {d.pool && (d.pool.left + d.pool.right) > 0 && (
                        <span> · Pool: R$ {(d.pool.left + d.pool.right).toFixed(2)} ({d.pool.tickets} apostas)</span>
                      )}
                    </div>

                    {d.status !== 'CANCELED' && (
                      <div className="mt-2 flex items-center gap-2 text-[11.5px]">
                        <I.Link size={12} style={{ color: 'var(--text-3)' }}/>
                        <a
                          href={buildShareLink(d)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 truncate font-mono"
                          style={{ color: 'var(--accent)' }}
                        >
                          {buildShareLink(d)}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <button className="btn btn-ghost" disabled={busy === d.id} onClick={() => void copyShareLink(d)} title="Copiar link público de aposta">
                      <I.Link size={13}/> Copiar link
                    </button>
                    {d.status !== 'FINISHED' && d.status !== 'CANCELED' && (
                      <button className="btn btn-ghost" disabled={busy === d.id} onClick={() => setEditFor(d)} title="Editar embate / banner">
                        <I.Edit size={13}/> Editar
                      </button>
                    )}
                    {d.status === 'BOOKING_OPEN' && (
                      <button className="btn" disabled={busy === d.id} onClick={() => void closeBooking(d)} style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                        <I.Pause size={13}/> Fechar mercado
                      </button>
                    )}
                    {(d.status === 'BOOKING_OPEN' || d.status === 'BOOKING_CLOSED') && (
                      <button className="btn btn-primary" disabled={busy === d.id} onClick={() => setSettleFor(d)}>
                        <I.Check size={13}/> Auditar
                      </button>
                    )}
                    {d.status !== 'FINISHED' && d.status !== 'CANCELED' && (
                      <button className="btn-icon" disabled={busy === d.id} onClick={() => void cancel(d)} title="Cancelar embate" style={{ color: '#ff7585' }}>
                        <I.Trash size={14}/>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {createOpen && (
        <CreateCustomDuelModal
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); void load(); }}
        />
      )}

      {editFor && (
        <EditCustomDuelModal
          duel={editFor}
          onClose={() => setEditFor(null)}
          onSaved={() => { setEditFor(null); void load(); }}
        />
      )}

      {settleFor && (
        <SettleCustomDuelModal
          duel={settleFor}
          onClose={() => setSettleFor(null)}
          onSaved={() => { setSettleFor(null); void load(); }}
        />
      )}
    </Page>
  );
}

const CarSide: React.FC<{ car: CarLite; won?: boolean; alignRight?: boolean }> = ({ car, won, alignRight }) => {
  const photo = resolveAsset(car.photoUrl);
  const label = car.name?.trim() || car.driver.name;
  return (
    <div className={`flex items-center gap-2 min-w-0 ${alignRight ? 'justify-end text-right flex-row-reverse' : ''}`}>
      <div className="w-9 h-9 rounded-[10px] overflow-hidden shrink-0" style={{ background: 'var(--surface-2)' }}>
        {photo ? <img src={photo} alt={label} className="w-full h-full object-cover"/> : <div className="w-full h-full grid place-items-center text-[color:var(--text-3)]"><I.Bolt size={14}/></div>}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-[13px] truncate">{label}</div>
        <div className="text-[10.5px] text-[color:var(--text-3)] truncate">
          {car.driver.name}
          {car.number ? ` · #${car.number}` : ''}
        </div>
      </div>
      {won && <span className="chip shrink-0" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>VENCEU</span>}
    </div>
  );
};

function CreateCustomDuelModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [cars, setCars] = React.useState<BackendCar[]>([]);
  const [events, setEvents] = React.useState<BackendEvent[]>([]);
  const [leftCarId, setLeftCarId] = React.useState('');
  const [rightCarId, setRightCarId] = React.useState('');
  const [eventId, setEventId] = React.useState('');
  const [scheduledAt, setScheduledAt] = React.useState('');
  const [bookingCloseAt, setBookingCloseAt] = React.useState('');
  const [customTitle, setCustomTitle] = React.useState('');
  const [bannerUrl, setBannerUrl] = React.useState('');
  const [bannerFile, setBannerFile] = React.useState<File | null>(null);
  const [bannerMode, setBannerMode] = React.useState<'link' | 'upload'>('link');
  const [isFeatured, setIsFeatured] = React.useState(false);
  const [notes, setNotes] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  React.useEffect(() => {
    Promise.all([
      api.get<BackendCar[]>(ENDPOINTS.CARS.list),
      api.get<BackendEvent[]>(ENDPOINTS.EVENTS.list),
    ]).then(([c, e]) => {
      setCars(c.filter((car) => car.active));
      setEvents(e.filter((ev) => ev.status !== 'CANCELED' && ev.status !== 'FINISHED'));
    }).catch(() => undefined);
  }, []);

  // Destaque exige vínculo a evento — limpa o toggle se o admin desvincular.
  React.useEffect(() => {
    if (!eventId && isFeatured) setIsFeatured(false);
  }, [eventId, isFeatured]);

  const previewUrl = React.useMemo(() => {
    if (bannerMode === 'upload' && bannerFile) return URL.createObjectURL(bannerFile);
    if (bannerMode === 'link' && bannerUrl.trim()) return bannerUrl.trim();
    return null;
  }, [bannerMode, bannerFile, bannerUrl]);

  React.useEffect(() => () => {
    if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const submit = async () => {
    if (!leftCarId || !rightCarId) { push({ title: 'Selecione os dois carros', tone: 'rose' }); return; }
    if (leftCarId === rightCarId) { push({ title: 'Os carros precisam ser diferentes', tone: 'rose' }); return; }
    if (!scheduledAt) { push({ title: 'Defina horário de início', tone: 'rose' }); return; }

    setBusy(true);
    try {
      const created = await api.post<{ duelId: string; eventId: string }>(ENDPOINTS.CUSTOM_DUELS.create, {
        leftCarId,
        rightCarId,
        scheduledAt,
        bookingCloseAt: bookingCloseAt || undefined,
        eventId: eventId || undefined,
        customTitle: customTitle.trim() || undefined,
        bannerUrl: bannerMode === 'link' && bannerUrl.trim() ? bannerUrl.trim() : undefined,
        isFeatured: eventId ? isFeatured : false,
        notes: notes.trim() || undefined,
      });

      if (bannerMode === 'upload' && bannerFile) {
        try {
          await apiUpload(ENDPOINTS.CUSTOM_DUELS.uploadBanner(created.duelId), bannerFile, 'banner');
        } catch (e) {
          push({ title: 'Embate criado, mas upload do banner falhou', body: e instanceof Error ? e.message : '', tone: 'amber' });
        }
      }

      // Link público pronto pra compartilhar — copia automaticamente pra clipboard.
      const shareLink = buildShareLink({ id: created.duelId, event: eventId ? { id: created.eventId } : null });
      const copied = await copyToClipboard(shareLink);
      push({
        title: 'Embate criado',
        body: copied ? `Link copiado: ${shareLink}` : shareLink,
        tone: 'emerald',
      });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] cmdk-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div className="surface-elev p-4 sm:p-6 w-full max-w-3xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <I.Sparkles size={18}/>
          </div>
          <div>
            <div className="font-display text-[18px] font-bold">Novo embate personalizado</div>
            <div className="text-[12px] text-[color:var(--text-3)]">Dois carros específicos, banner próprio, vínculo a evento opcional. Mercado já abre na criação.</div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <CarPicker label="Carro esquerda *" value={leftCarId} onChange={setLeftCarId} cars={cars}/>
          <CarPicker label="Carro direita *" value={rightCarId} onChange={setRightCarId} cars={cars}/>
        </div>

        <div className="mt-4">
          <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Vincular a evento (opcional)</label>
          <select className="input mt-1" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">— Sem vínculo (embate avulso)</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} · {new Date(ev.startAt).toLocaleDateString('pt-BR')}
              </option>
            ))}
          </select>
          <div className="text-[11px] text-[color:var(--text-3)] mt-1">Se sem vínculo, fica num evento curinga "✨ Embates Personalizados".</div>
        </div>

        <FeaturedToggle enabled={!!eventId} value={isFeatured} onChange={setIsFeatured}/>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Início *</label>
            <div className="mt-1">
              <DatePicker value={scheduledAt} onChange={setScheduledAt} placeholder="Data e hora"/>
            </div>
          </div>
          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Fechar booking em</label>
            <div className="mt-1">
              <DatePicker value={bookingCloseAt} onChange={setBookingCloseAt} placeholder="Default: +1h após início"/>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Título do embate (opcional)</label>
          <input className="input mt-1" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Ex: Final do Festival do Opala"/>
          <div className="text-[11px] text-[color:var(--text-3)] mt-1">Se vazio, mostra "{`{carro esquerda}`} x {`{carro direita}`}".</div>
        </div>

        <BannerEditor
          mode={bannerMode} setMode={setBannerMode}
          url={bannerUrl} setUrl={setBannerUrl}
          file={bannerFile} setFile={setBannerFile}
          previewUrl={previewUrl}
        />

        <div className="mt-4">
          <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Notas (opcional)</label>
          <input className="input mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Visível apenas no painel admin"/>
        </div>

        <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Criando…</> : <><I.Check size={14}/> Criar e abrir mercado</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditCustomDuelModal({ duel, onClose, onSaved }: { duel: CustomDuel; onClose: () => void; onSaved: () => void }) {
  const [events, setEvents] = React.useState<BackendEvent[]>([]);
  const [eventId, setEventId] = React.useState(duel.event?.id ?? '');
  const [scheduledAt, setScheduledAt] = React.useState(duel.startsAt.slice(0, 16));
  const [bookingCloseAt, setBookingCloseAt] = React.useState(duel.bookingCloseAt.slice(0, 16));
  const [customTitle, setCustomTitle] = React.useState(duel.customTitle ?? '');
  const [bannerUrl, setBannerUrl] = React.useState(duel.bannerUrl && duel.bannerUrl.startsWith('http') ? duel.bannerUrl : '');
  const [bannerFile, setBannerFile] = React.useState<File | null>(null);
  const [bannerMode, setBannerMode] = React.useState<'link' | 'upload'>(duel.bannerUrl && !duel.bannerUrl.startsWith('http') ? 'upload' : 'link');
  const [isFeatured, setIsFeatured] = React.useState(duel.isFeatured);
  const [notes, setNotes] = React.useState(duel.notes ?? '');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  React.useEffect(() => {
    if (!eventId && isFeatured) setIsFeatured(false);
  }, [eventId, isFeatured]);

  React.useEffect(() => {
    api.get<BackendEvent[]>(ENDPOINTS.EVENTS.list)
      .then((e) => setEvents(e.filter((ev) => ev.status !== 'CANCELED' && ev.status !== 'FINISHED')))
      .catch(() => undefined);
  }, []);

  const previewUrl = React.useMemo(() => {
    if (bannerMode === 'upload' && bannerFile) return URL.createObjectURL(bannerFile);
    if (bannerMode === 'link' && bannerUrl.trim()) return bannerUrl.trim();
    if (duel.bannerUrl) return resolveAsset(duel.bannerUrl);
    return null;
  }, [bannerMode, bannerFile, bannerUrl, duel.bannerUrl]);

  React.useEffect(() => () => {
    if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const removeBanner = async () => {
    setBusy(true);
    try {
      await api.del(ENDPOINTS.CUSTOM_DUELS.deleteBanner(duel.id));
      push({ title: 'Banner removido', tone: 'amber' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true);
    try {
      await api.patch(ENDPOINTS.CUSTOM_DUELS.update(duel.id), {
        scheduledAt,
        bookingCloseAt,
        customTitle: customTitle.trim() || null,
        notes: notes.trim() || null,
        eventId: eventId || null,
        isFeatured: eventId ? isFeatured : false,
        ...(bannerMode === 'link' ? { bannerUrl: bannerUrl.trim() || null } : {}),
      });

      if (bannerMode === 'upload' && bannerFile) {
        await apiUpload(ENDPOINTS.CUSTOM_DUELS.uploadBanner(duel.id), bannerFile, 'banner');
      }

      push({ title: 'Embate atualizado', tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] cmdk-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div className="surface-elev p-4 sm:p-6 w-full max-w-3xl max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <I.Edit size={18}/>
          </div>
          <div>
            <div className="font-display text-[18px] font-bold">Editar embate personalizado</div>
            <div className="text-[12px] text-[color:var(--text-3)]">Carros não podem ser trocados após criação. Ajuste datas, banner, título e vínculo.</div>
          </div>
        </div>

        <div className="surface-2 p-3 mb-4" style={{ borderRadius: 12 }}>
          <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)] mb-2">Carros do embate</div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <CarSide car={duel.leftCar} alignRight/>
            <div className="text-center text-[10.5px] font-bold tracking-[0.18em] uppercase" style={{ color: 'var(--text-3)' }}>VS</div>
            <CarSide car={duel.rightCar}/>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Vincular a evento</label>
          <select className="input mt-1" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">— Sem vínculo (embate avulso)</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} · {new Date(ev.startAt).toLocaleDateString('pt-BR')}
              </option>
            ))}
          </select>
        </div>

        <FeaturedToggle enabled={!!eventId} value={isFeatured} onChange={setIsFeatured}/>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Início</label>
            <div className="mt-1">
              <DatePicker value={scheduledAt} onChange={setScheduledAt} placeholder="Data e hora"/>
            </div>
          </div>
          <div>
            <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Fechar booking em</label>
            <div className="mt-1">
              <DatePicker value={bookingCloseAt} onChange={setBookingCloseAt} placeholder="Data e hora"/>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Título do embate</label>
          <input className="input mt-1" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Deixe vazio para usar nome dos carros"/>
        </div>

        <BannerEditor
          mode={bannerMode} setMode={setBannerMode}
          url={bannerUrl} setUrl={setBannerUrl}
          file={bannerFile} setFile={setBannerFile}
          previewUrl={previewUrl}
          onRemove={duel.bannerUrl ? removeBanner : undefined}
        />

        <div className="mt-4">
          <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Notas</label>
          <input className="input mt-1" value={notes} onChange={(e) => setNotes(e.target.value)}/>
        </div>

        <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Salvando…</> : <><I.Check size={14}/> Salvar alterações</>}
          </button>
        </div>
      </div>
    </div>
  );
}

const CarPicker: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  cars: BackendCar[];
}> = ({ label, value, onChange, cars }) => {
  const selected = cars.find((c) => c.id === value);
  const photo = resolveAsset(selected?.photoUrl ?? null);
  return (
    <div className="surface-2 p-3" style={{ borderRadius: 12 }}>
      <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">{label}</label>
      <select className="input mt-1.5" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione um carro…</option>
        {cars.map((c) => {
          const carLabel = c.name?.trim() || c.driver.name;
          return (
            <option key={c.id} value={c.id}>
              {carLabel} · {c.driver.name}{c.number ? ` · #${c.number}` : ''}
            </option>
          );
        })}
      </select>
      {selected && (
        <div className="flex items-center gap-2 mt-2.5 p-2 rounded-[10px]" style={{ background: 'var(--surface)' }}>
          <div className="w-10 h-10 rounded-[8px] overflow-hidden shrink-0" style={{ background: 'var(--surface-2)' }}>
            {photo ? <img src={photo} alt={selected.name} className="w-full h-full object-cover"/> : <div className="w-full h-full grid place-items-center text-[color:var(--text-3)]"><I.Bolt size={14}/></div>}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[12.5px] truncate">{selected.name?.trim() || selected.driver.name}</div>
            <div className="text-[10.5px] text-[color:var(--text-3)] truncate">{selected.driver.name} · {selected.category}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const BannerEditor: React.FC<{
  mode: 'link' | 'upload';
  setMode: (m: 'link' | 'upload') => void;
  url: string;
  setUrl: (v: string) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  previewUrl: string | null;
  onRemove?: () => void;
}> = ({ mode, setMode, url, setUrl, file, setFile, previewUrl, onRemove }) => (
  <div className="surface-2 p-3 mt-4" style={{ borderRadius: 12 }}>
    <div className="flex items-center justify-between gap-2 mb-2">
      <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">Banner do embate</label>
      {onRemove && (
        <button type="button" className="text-[11px] font-semibold" onClick={onRemove} style={{ color: '#ff7585' }}>
          Remover banner atual
        </button>
      )}
    </div>
    <div className="flex gap-1 mb-3">
      <button type="button" className={`tab ${mode === 'link' ? 'active' : ''}`} onClick={() => setMode('link')}>Link</button>
      <button type="button" className={`tab ${mode === 'upload' ? 'active' : ''}`} onClick={() => setMode('upload')}>Upload</button>
    </div>
    {mode === 'link' ? (
      <input
        className="input"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://… (cole a URL completa da imagem)"
      />
    ) : (
      <div className="flex items-center gap-2">
        <label className="btn btn-ghost cursor-pointer">
          <I.Upload size={13}/> {file ? 'Trocar arquivo' : 'Escolher arquivo'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {file && (
          <span className="text-[11.5px] text-[color:var(--text-3)] min-w-0 truncate flex-1">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
          </span>
        )}
      </div>
    )}
    {previewUrl && (
      <div className="mt-3 relative w-full overflow-hidden" style={{ aspectRatio: '5/1', borderRadius: 10, background: 'var(--surface)' }}>
        <img src={previewUrl} alt="Preview banner" className="absolute inset-0 w-full h-full object-cover"/>
      </div>
    )}
  </div>
);

const FeaturedToggle: React.FC<{
  enabled: boolean;
  value: boolean;
  onChange: (v: boolean) => void;
}> = ({ enabled, value, onChange }) => (
  <button
    type="button"
    disabled={!enabled}
    onClick={() => onChange(!value)}
    className="w-full text-left mt-4 p-3 flex items-center gap-3"
    style={{
      borderRadius: 12,
      background: value ? 'rgba(255,197,90,0.10)' : 'var(--surface-2)',
      border: '1px solid ' + (value ? 'rgba(255,197,90,0.45)' : 'var(--border)'),
      opacity: enabled ? 1 : 0.5,
      cursor: enabled ? 'pointer' : 'not-allowed',
    }}
  >
    <div
      className="w-10 h-10 rounded-[10px] grid place-items-center shrink-0"
      style={{
        background: value ? 'rgba(255,197,90,0.18)' : 'var(--surface)',
        color: value ? '#ffc55a' : 'var(--text-3)',
      }}
    >
      <I.Star size={18}/>
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-[13.5px] font-semibold" style={{ color: value ? '#ffc55a' : 'var(--text)' }}>
        Destacar este embate
      </div>
      <div className="text-[11.5px] text-[color:var(--text-3)] mt-0.5">
        {enabled
          ? 'Aparece numa faixa "Embates em Destaque" no topo de /apostas.'
          : 'Vincule a um evento pra liberar o destaque.'}
      </div>
    </div>
    <div
      className="shrink-0 relative"
      style={{
        width: 36, height: 20, borderRadius: 999,
        background: value ? '#ffc55a' : 'var(--surface)',
        border: '1px solid ' + (value ? '#ffc55a' : 'var(--border)'),
        transition: 'background .15s',
      }}
    >
      <div style={{
        position: 'absolute', top: 1, left: value ? 17 : 1,
        width: 16, height: 16, borderRadius: '50%',
        background: value ? '#1a1106' : 'var(--text-3)',
        transition: 'left .15s',
      }}/>
    </div>
  </button>
);

function SettleCustomDuelModal({ duel, onClose, onSaved }: { duel: CustomDuel; onClose: () => void; onSaved: () => void }) {
  const [winningSide, setWinningSide] = React.useState<'LEFT' | 'RIGHT'>('LEFT');
  const [busy, setBusy] = React.useState(false);
  const { push } = useToast();

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(ENDPOINTS.CUSTOM_DUELS.settle(duel.id), { winningSide });
      const winner = winningSide === 'LEFT' ? duel.leftCar : duel.rightCar;
      push({ title: 'Embate auditado', body: `Vencedor: ${winner.name?.trim() || winner.driver.name}`, tone: 'emerald' });
      onSaved();
    } catch (e) { push({ title: 'Erro', body: e instanceof Error ? e.message : '', tone: 'rose' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[200] cmdk-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div className="surface-elev p-4 sm:p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0" style={{ background: 'var(--emerald-soft)', color: 'var(--emerald)' }}>
            <I.Check size={18}/>
          </div>
          <div>
            <div className="font-display text-[18px] font-bold">Auditar vencedor</div>
            <div className="text-[12px] text-[color:var(--text-3)]">Apostas em aberto serão liquidadas e o saldo dos vencedores creditado.</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {(['LEFT', 'RIGHT'] as const).map((side) => {
            const car = side === 'LEFT' ? duel.leftCar : duel.rightCar;
            const selected = winningSide === side;
            const label = car.name?.trim() || car.driver.name;
            return (
              <button
                key={side}
                onClick={() => setWinningSide(side)}
                className="text-center p-3"
                style={{
                  borderRadius: 12,
                  background: selected ? 'var(--emerald-soft)' : 'var(--surface-2)',
                  border: '2px solid ' + (selected ? 'var(--emerald)' : 'transparent'),
                  color: selected ? 'var(--emerald)' : 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                <div className="text-[10.5px] font-semibold tracking-[0.14em] uppercase mb-1">
                  {side === 'LEFT' ? 'Esquerda' : 'Direita'}
                </div>
                <div className="font-semibold text-[13px] truncate">{label}</div>
                <div className="text-[10.5px] mt-0.5" style={{ opacity: 0.7 }}>{car.driver.name}</div>
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={submit} disabled={busy}>
            {busy ? <><span className="pulse-dot"/> Auditando…</> : <><I.Check size={14}/> Confirmar vencedor</>}
          </button>
        </div>
      </div>
    </div>
  );
}
