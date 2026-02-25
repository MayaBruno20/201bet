'use client';

import { useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { MarketSnapshot } from '@/types/market';

const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3502/realtime';

export function LiveMarketSection() {
  const [market, setMarket] = useState<MarketSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [stake, setStake] = useState(100);

  useEffect(() => {
    const socket: Socket = io(wsUrl, { transports: ['websocket'] });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('market:sync', {});
    });

    socket.on('disconnect', () => setConnected(false));
    socket.on('market:update', (payload: MarketSnapshot) => setMarket(payload));

    return () => {
      socket.disconnect();
    };
  }, []);

  const previewLeft = useMemo(() => (market ? (stake * market.duel.left.odd).toFixed(2) : '0.00'), [market, stake]);
  const previewRight = useMemo(() => (market ? (stake * market.duel.right.odd).toFixed(2) : '0.00'), [market, stake]);

  return (
    <section id='painel' className='mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8'>
      <div className='mb-4 flex flex-wrap items-center gap-3'>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${connected ? 'bg-emerald-400/20 text-emerald-200' : 'bg-amber-400/20 text-amber-200'}`}>
          {connected ? 'Realtime online' : 'Reconectando'}
        </span>
        <span className='rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/75'>Fecha em {market?.closeInSeconds ?? '--'}s</span>
      </div>

      <div className='grid gap-5 lg:grid-cols-[1.2fr_0.8fr]'>
        <article className='rounded-2xl border border-white/10 bg-[#0f1321] p-5 sm:p-6'>
          <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
            <h4 className='text-xl font-bold'>Duelo ao vivo: {market?.eventName ?? 'Aguardando sincronização'}</h4>
            <span className='rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70'>Odds dinâmicas ligadas</span>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <BetPanel title={market?.duel.left.label ?? 'Carro A'} odd={market?.duel.left.odd} tickets={market?.duel.left.tickets} payout={previewLeft} color='blue' />
            <BetPanel title={market?.duel.right.label ?? 'Carro B'} odd={market?.duel.right.odd} tickets={market?.duel.right.tickets} payout={previewRight} color='orange' />
          </div>
          <div className='mt-5 grid gap-3 sm:grid-cols-[1fr_auto]'>
            <input
              className='rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white outline-none ring-amber-300/60 transition focus:ring-2'
              type='number'
              min={10}
              step={10}
              value={stake}
              onChange={(event) => setStake(Number(event.target.value || 0))}
            />
            <button className='rounded-xl bg-emerald-400 px-5 py-3 text-sm font-extrabold text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-500' disabled={market?.locked || !connected}>
              {market?.locked ? 'Mercado travado' : 'Confirmar aposta (mock)'}
            </button>
          </div>
        </article>

        <aside className='rounded-2xl border border-white/10 bg-[#0f1321] p-5 sm:p-6'>
          <p className='text-xs font-bold uppercase tracking-[0.18em] text-cyan-300'>Painel do usuário</p>
          <h4 className='mt-2 text-xl font-bold'>Carteira e notificações</h4>
          <div className='mt-4 space-y-3 text-sm text-white/80'>
            <InfoRow label='Saldo disponível' value='R$ 2.450,00' />
            <InfoRow label='Depósito PIX' value='Habilitado' />
            <InfoRow label='Saque PIX' value='Assíncrono' />
            <InfoRow label='Notificações Telegram' value='Conectado' />
            <InfoRow label='Perfil de acesso' value='Usuário padrão' />
          </div>
        </aside>
      </div>
    </section>
  );
}

function BetPanel({ title, odd, tickets, payout, color }: { title: string; odd?: number; tickets?: number; payout: string; color: 'blue' | 'orange' }) {
  const tone = color === 'blue' ? 'from-sky-600 to-blue-500' : 'from-orange-500 to-amber-400';

  return (
    <div className='rounded-xl border border-white/10 bg-white/5 p-4'>
      <div className={`rounded-xl bg-gradient-to-br ${tone} p-4 text-white`}>
        <p className='text-xs uppercase tracking-[0.14em] text-white/85'>DUELO</p>
        <p className='mt-1 text-xl font-bold'>{title}</p>
        <p className='mt-3 text-sm'>Odd atual</p>
        <p className='text-3xl font-extrabold'>{odd?.toFixed(2) ?? '--'}</p>
      </div>
      <div className='mt-3 space-y-1 text-sm text-white/80'>
        <p>Tickets: {tickets ?? '--'}</p>
        <p>Retorno estimado: R$ {payout}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2'>
      <span className='text-white/70'>{label}</span>
      <span className='font-semibold text-white'>{value}</span>
    </div>
  );
}
