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
        <article className='rounded-3xl border border-white/10 bg-[#101525] p-5 sm:p-6 backdrop-blur-md'>
          <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
            <h4 className='text-xl font-medium'>Duelo ao vivo: {market?.eventName ?? 'Aguardando sincronização'}</h4>
            <span className='rounded-full bg-white/5 border border-white/5 px-3 py-1 text-xs font-medium text-white/50'>Odds dinâmicas</span>
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <BetPanel title={market?.duel.left.label ?? 'Carro A'} odd={market?.duel.left.odd} tickets={market?.duel.left.tickets} payout={previewLeft} color='blue' />
            <BetPanel title={market?.duel.right.label ?? 'Carro B'} odd={market?.duel.right.odd} tickets={market?.duel.right.tickets} payout={previewRight} color='orange' />
          </div>
          <div className='mt-5 grid gap-3 sm:grid-cols-[1fr_auto]'>
            <input
              className='rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-all focus:border-white/20 focus:ring-4 focus:ring-white/5'
              type='number'
              min={10}
              step={10}
              value={stake}
              onChange={(event) => setStake(Number(event.target.value || 0))}
            />
            <button className='rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] hover:scale-[1.01] disabled:opacity-50 disabled:pointer-events-none' disabled={market?.locked || !connected}>
              {market?.locked ? 'Mercado travado' : 'Confirmar aposta (mock)'}
            </button>
          </div>
        </article>

        <aside className='rounded-3xl border border-white/10 bg-[#101525] p-5 sm:p-6 backdrop-blur-md'>
          <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3'>Painel do usuário</p>
          <h4 className='mt-2 text-xl font-medium'>Carteira e notificações</h4>
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
    <div className='rounded-2xl border border-white/8 bg-white/[0.04] p-4'>
      <div className={`rounded-xl bg-gradient-to-br ${tone} p-4 text-white`}>
        <p className='text-[10px] uppercase tracking-widest text-white/60'>DUELO</p>
        <p className='mt-1 text-lg font-medium'>{title}</p>
        <p className='mt-3 text-xs text-white/60'>Cotação</p>
        <p className='text-3xl font-bold tracking-tighter'>{odd?.toFixed(2) ?? '--'}</p>
      </div>
      <div className='mt-3 space-y-1 text-sm text-white/50'>
        <p>Tickets: {tickets ?? '--'}</p>
        <p>Retorno estimado: R$ {payout}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5'>
      <span className='text-white/40'>{label}</span>
      <span className='font-medium text-white/80'>{value}</span>
    </div>
  );
}
