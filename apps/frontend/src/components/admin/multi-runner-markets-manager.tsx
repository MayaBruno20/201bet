'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-request';
import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

type MarketType = 'WINNER' | 'BEST_REACTION' | 'FALSE_START';

const TYPE_LABEL: Record<MarketType, string> = {
  WINNER: 'Vencedor Geral',
  BEST_REACTION: 'Melhor Reação',
  FALSE_START: 'Queimada',
};

type MarketOdd = {
  id: string;
  label: string;
  value: string | number;
  status: string;
};

type Market = {
  id: string;
  name: string;
  type: string;
  status: string;
  rakePercent?: string | number | null;
  bookingCloseAt?: string | null;
  winnerOddId?: string | null;
  event: { id: string; name: string };
  odds: MarketOdd[];
};

type DefaultRunner = { label: string };

export function MultiRunnerMarketsManager({
  eventId,
  defaultRunners,
  onChange,
}: {
  eventId: string | null | undefined;
  defaultRunners?: DefaultRunner[];
  onChange?: () => void;
}) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<MarketType>('WINNER');
  const [runnersText, setRunnersText] = useState('');
  const [rakeText, setRakeText] = useState('');
  const [bookingCloseAt, setBookingCloseAt] = useState('');

  const load = useCallback(async () => {
    if (!eventId) {
      setMarkets([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`${apiUrl}/admin/markets?eventId=${eventId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      setMarkets((await res.json()) as Market[]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha ao carregar mercados');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fillDefaultRunners = () => {
    if (!defaultRunners?.length) return;
    setRunnersText(defaultRunners.map((r) => r.label).join(', '));
  };

  const submit = async (label: string, fn: () => Promise<Response>) => {
    if (!eventId) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fn();
      if (!res.ok) {
        const raw = await res.text();
        let friendly = raw;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.message) && parsed.message[0]) friendly = parsed.message.join('; ');
          else if (typeof parsed?.message === 'string') friendly = parsed.message;
        } catch { /* not JSON */ }
        throw new Error(friendly);
      }
      await load();
      onChange?.();
      setMessage(`${label}: sucesso.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : `Falha em ${label}`);
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!eventId) {
      setMessage('Evento ainda não está vinculado para apostas. Salve o evento primeiro.');
      return;
    }
    const runners = runnersText.split(',').map((s) => s.trim()).filter(Boolean);
    if (!name.trim() || runners.length < 2) {
      setMessage('Informe um nome e pelo menos 2 opções (separadas por vírgula).');
      return;
    }
    const rake = rakeText ? Number(rakeText) : undefined;
    await submit('Criar mercado', () =>
      apiFetch(`${apiUrl}/admin/markets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          name: name.trim(),
          type,
          runners,
          rakePercent: rake,
          bookingCloseAt: bookingCloseAt || undefined,
        }),
      }),
    );
    setName('');
    setRunnersText('');
    setRakeText('');
    setBookingCloseAt('');
  };

  const settle = async (marketId: string, winnerOddId: string) => {
    if (!winnerOddId) return;
    await submit('Liquidar mercado', () =>
      apiFetch(`${apiUrl}/admin/markets/${marketId}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerOddId }),
      }),
    );
  };

  const voidMarket = async (marketId: string) => {
    await submit('Anular mercado', () =>
      apiFetch(`${apiUrl}/admin/markets/${marketId}/void`, { method: 'POST' }),
    );
  };

  if (!eventId) {
    return (
      <div className='rounded-2xl border border-dashed border-white/10 bg-[#101525] p-4 text-xs text-white/40'>
        Os mercados Multi-Runner ficam disponíveis assim que o evento for vinculado para apostas.
      </div>
    );
  }

  return (
    <div className='rounded-2xl border border-white/10 bg-[#101525] p-4 sm:p-5'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <p className='text-[10px] font-semibold uppercase tracking-widest text-white/40'>Mercados Multi-Runner</p>
          <h3 className='text-sm font-semibold'>Vencedor / Reação / Queimada deste evento</h3>
        </div>
        <button
          type='button'
          onClick={() => void load()}
          className='rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/70 hover:bg-white/10'
        >
          Recarregar
        </button>
      </div>

      {message && (
        <div className={`mt-3 rounded-lg border p-2 text-xs ${/falha|erro|invalid/i.test(message) ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
          {message}
        </div>
      )}

      {/* Form de criação */}
      <div className='mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4'>
        <input
          className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none'
          placeholder='Nome do mercado (ex: Vencedor Copa)'
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none'
          value={type}
          onChange={(e) => setType(e.target.value as MarketType)}
        >
          <option value='WINNER'>Vencedor Geral</option>
          <option value='BEST_REACTION'>Melhor Reação</option>
          <option value='FALSE_START'>Queimada</option>
        </select>
        <input
          className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none sm:col-span-2'
          placeholder='Opções/pilotos (separar por vírgula)'
          value={runnersText}
          onChange={(e) => setRunnersText(e.target.value)}
        />
        <input
          type='number'
          step='0.1'
          className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none'
          placeholder='Rake % (padrão do motor)'
          value={rakeText}
          onChange={(e) => setRakeText(e.target.value)}
        />
        <input
          type='datetime-local'
          className='rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none'
          value={bookingCloseAt}
          onChange={(e) => setBookingCloseAt(e.target.value)}
        />
        <div className='flex gap-2 sm:col-span-2'>
          {defaultRunners?.length ? (
            <button
              type='button'
              onClick={fillDefaultRunners}
              className='rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10'
            >
              Preencher com inscritos ({defaultRunners.length})
            </button>
          ) : null}
          <button
            type='button'
            onClick={() => void create()}
            disabled={loading}
            className='flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-black disabled:opacity-50'
          >
            + Criar mercado
          </button>
        </div>
      </div>

      {/* Lista de mercados */}
      <div className='mt-4 space-y-2'>
        {markets.length === 0 && (
          <p className='rounded-lg border border-dashed border-white/10 p-3 text-xs text-white/40'>
            Nenhum mercado Multi-Runner para este evento. Crie um acima.
          </p>
        )}
        {markets.map((m) => (
          <MarketRow
            key={m.id}
            market={m}
            disabled={loading}
            onSettle={(winnerOddId) => void settle(m.id, winnerOddId)}
            onVoid={() => void voidMarket(m.id)}
          />
        ))}
      </div>
    </div>
  );
}

function MarketRow({
  market,
  disabled,
  onSettle,
  onVoid,
}: {
  market: Market;
  disabled: boolean;
  onSettle: (winnerOddId: string) => void;
  onVoid: () => void;
}) {
  const [winnerOddId, setWinnerOddId] = useState(market.winnerOddId ?? market.odds[0]?.id ?? '');
  const isSettled = market.status === 'SETTLED' || market.status === 'VOIDED';
  const typeLabel = TYPE_LABEL[market.type as MarketType] ?? market.type;
  return (
    <div className='rounded-xl border border-white/10 bg-white/[0.03] p-3'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div className='min-w-0'>
          <p className='text-sm font-semibold'>{market.name}</p>
          <p className='text-[11px] text-white/40'>
            {typeLabel} · {market.event.name} · Status: <span className='font-semibold text-white/70'>{market.status}</span>
          </p>
        </div>
        {!isSettled && (
          <div className='flex flex-wrap items-center gap-2'>
            <select
              className='rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none'
              value={winnerOddId}
              onChange={(e) => setWinnerOddId(e.target.value)}
            >
              {market.odds.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <button
              type='button'
              disabled={disabled}
              onClick={() => onSettle(winnerOddId)}
              className='rounded-lg bg-emerald-500/80 px-3 py-1.5 text-[11px] font-bold text-black disabled:opacity-50'
            >
              Liquidar
            </button>
            <button
              type='button'
              disabled={disabled}
              onClick={() => onVoid()}
              className='rounded-lg bg-red-500/80 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50'
            >
              Anular
            </button>
          </div>
        )}
      </div>
      <div className='mt-2 flex flex-wrap gap-1.5'>
        {market.odds.map((o) => (
          <span
            key={o.id}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] ${o.id === market.winnerOddId ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-white/5 border-white/10 text-white/70'}`}
          >
            {o.label}{o.id === market.winnerOddId ? ' ✓' : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
