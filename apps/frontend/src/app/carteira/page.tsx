'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { clearAuthToken, getAuthToken, getStoredUser, SessionUser, setStoredUser } from '@/lib/auth';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3502/api';
type UserTab = 'conta' | 'saldo' | 'historico' | 'transacoes';

type MeResponse = SessionUser & {
  firstName?: string | null;
  lastName?: string | null;
  cpf: string;
  birthDate: string;
  phone?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  postalCode?: string | null;
  nationality?: string | null;
  gender?: string | null;
  wallet?: { balance: number; currency: string };
};

type MyTransactions = {
  wallet: { balance: number; currency: string };
  ledger: Array<{ id: string; type: string; amount: number; reference?: string | null; createdAt: string }>;
  payments: Array<{ id: string; type: string; amount: number; provider: string; status: string; createdAt: string }>;
};

type MyBet = {
  id: string;
  stake: number;
  potentialWin: number;
  status: string;
  createdAt: string;
  items: Array<{ id: string; oddAtPlacement: number; oddLabel: string; marketName: string; eventName: string }>;
};

const TAB_LABELS: Record<UserTab, string> = {
  conta: 'Perfil',
  saldo: 'Meu saldo',
  historico: 'Histórico de Jogo',
  transacoes: 'Transações',
};

function traduzirStatusAposta(status: string) {
  const mapa: Record<string, string> = {
    OPEN: 'Aberta',
    WON: 'Ganha',
    LOST: 'Perdida',
    CANCELED: 'Cancelada',
    REFUNDED: 'Reembolsada',
  };
  return mapa[status] ?? status;
}

function traduzirTipoLedger(tipo: string) {
  const mapa: Record<string, string> = {
    DEPOSIT: 'Depósito',
    WITHDRAW: 'Saque',
    BET_PLACED: 'Aposta realizada',
    BET_WON: 'Aposta ganha',
    BET_REFUND: 'Reembolso de aposta',
    BONUS: 'Bônus',
    ADJUSTMENT: 'Ajuste administrativo',
  };
  return mapa[tipo] ?? tipo;
}

function traduzirTipoPagamento(tipo: string) {
  const mapa: Record<string, string> = {
    DEPOSIT: 'Depósito',
    WITHDRAW: 'Saque',
  };
  return mapa[tipo] ?? tipo;
}

function traduzirStatusPagamento(status: string) {
  const mapa: Record<string, string> = {
    PENDING: 'Pendente',
    APPROVED: 'Aprovado',
    FAILED: 'Falhou',
    CANCELED: 'Cancelado',
  };
  return mapa[status] ?? status;
}

export default function CarteiraPage() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<MeResponse | null>(null);
  const [transactions, setTransactions] = useState<MyTransactions | null>(null);
  const [bets, setBets] = useState<MyBet[]>([]);
  const [activeTab, setActiveTab] = useState<UserTab>('conta');
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    country: 'Brasil',
    state: '',
    city: '',
    address: '',
    postalCode: '',
    nationality: 'Brasileira',
    gender: '',
    avatarUrl: '',
  });

  useEffect(() => {
    setToken(getAuthToken());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tabFromQuery = new URLSearchParams(window.location.search).get('tab');
    if (tabFromQuery === 'saldo' || tabFromQuery === 'historico' || tabFromQuery === 'transacoes' || tabFromQuery === 'conta') {
      setActiveTab(tabFromQuery);
    }
  }, []);

  useEffect(() => {
    if (!token) return;

    void (async () => {
      setLoading(true);
      setStatusMessage('');
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [meRes, transRes, betsRes] = await Promise.all([
          fetch(`${apiUrl}/auth/me`, { headers, cache: 'no-store' }),
          fetch(`${apiUrl}/auth/my-transactions`, { headers, cache: 'no-store' }),
          fetch(`${apiUrl}/auth/my-bets`, { headers, cache: 'no-store' }),
        ]);

        if (!meRes.ok) {
          clearAuthToken();
          setToken(null);
          setStatusMessage('Sessão expirada. Faça login novamente.');
          return;
        }

        const me = (await meRes.json()) as MeResponse;
        setUser(me);
        setStoredUser({
          id: me.id,
          email: me.email,
          name: me.name,
          role: me.role,
          status: me.status,
          avatarUrl: me.avatarUrl,
        });

        setProfileForm({
          firstName: me.firstName ?? '',
          lastName: me.lastName ?? '',
          phone: me.phone ?? '',
          country: me.country ?? 'Brasil',
          state: me.state ?? '',
          city: me.city ?? '',
          address: me.address ?? '',
          postalCode: me.postalCode ?? '',
          nationality: me.nationality ?? 'Brasileira',
          gender: me.gender ?? '',
          avatarUrl: me.avatarUrl ?? '',
        });

        if (transRes.ok) {
          setTransactions((await transRes.json()) as MyTransactions);
        }

        if (betsRes.ok) {
          setBets((await betsRes.json()) as MyBet[]);
        }
      } catch {
        setStatusMessage('Falha ao carregar painel do usuário.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const displayName = useMemo(() => {
    if (!user) return 'Usuário';
    return user.firstName?.trim() || user.name;
  }, [user]);

  async function saveProfile() {
    if (!token) return;

    setLoading(true);
    setStatusMessage('');
    try {
      const res = await fetch(`${apiUrl}/auth/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(profileForm),
      });

      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || 'Falha ao salvar perfil');
      }

      const updated = (await res.json()) as MeResponse;
      setUser(updated);
      setStoredUser({
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        status: updated.status,
        avatarUrl: updated.avatarUrl,
      });
      setStatusMessage('Perfil atualizado com sucesso.');
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : 'Falha ao salvar perfil.');
    } finally {
      setLoading(false);
    }
  }

  function onAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 1_500_000) {
      setStatusMessage('Imagem muito grande. Use arquivo de até 1.5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setProfileForm((prev) => ({ ...prev, avatarUrl: result }));
      }
    };
    reader.readAsDataURL(file);
  }

  if (!token) {
    return (
      <main className='min-h-screen bg-[#090b11] text-white'>
        <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
          <MainNav />
          <section className='mt-8 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-6'>
            <h1 className='text-2xl font-bold'>Login necessário</h1>
            <p className='mt-2 text-white/80'>Entre com sua conta para acessar o painel do usuário.</p>
            <a href='/login' className='mt-4 inline-flex rounded-lg bg-amber-400 px-4 py-2 font-bold text-black'>Ir para login</a>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className='min-h-screen bg-[#090b11] pb-10 text-white'>
      <div className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
        <MainNav />

        <section className='rounded-2xl border border-white/10 bg-[#101525] p-4'>
          <div className='flex flex-wrap items-center gap-4'>
            <div className='h-14 w-14 overflow-hidden rounded-full border border-white/20 bg-white/10'>
              {profileForm.avatarUrl ? (
                <img src={profileForm.avatarUrl} alt='Avatar do usuário' className='h-full w-full object-cover' />
              ) : (
                <div className='flex h-full w-full items-center justify-center text-xl font-extrabold'>{displayName.slice(0, 1).toUpperCase()}</div>
              )}
            </div>
            <div>
              <p className='text-lg font-bold'>{displayName}</p>
              <p className='text-sm text-white/70'>{user?.email}</p>
            </div>
          </div>

          <div className='mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-4'>
            {(Object.keys(TAB_LABELS) as UserTab[]).map((tab) => (
              <button
                key={tab}
                type='button'
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-3 py-2 text-sm ${activeTab === tab ? 'bg-cyan-400 font-bold text-black' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </section>

        {statusMessage ? <p className='mt-4 rounded-lg border border-white/15 bg-white/5 p-2 text-sm'>{statusMessage}</p> : null}

        {activeTab === 'conta' ? (
          <section className='mt-6 grid gap-4 lg:grid-cols-[280px_1fr]'>
            <aside className='rounded-2xl border border-white/10 bg-[#101525] p-4'>
              <p className='text-xs font-bold uppercase tracking-[0.18em] text-cyan-300'>Conta</p>
              <p className='mt-2 text-sm text-white/75'>Informações de perfil e documento.</p>
              <label className='mt-4 block rounded-lg border border-white/15 bg-white/5 p-3 text-sm'>
                Trocar foto
                <input type='file' accept='image/*' className='mt-2 block text-xs' onChange={onAvatarUpload} />
              </label>
            </aside>

            <article className='rounded-2xl border border-white/10 bg-[#101525] p-4'>
              <h2 className='text-2xl font-bold'>Informações da Conta</h2>
              <div className='mt-4 grid gap-3 md:grid-cols-2'>
                <input className='field' placeholder='Primeiro nome' value={profileForm.firstName} onChange={(e) => setProfileForm((p) => ({ ...p, firstName: e.target.value }))} />
                <input className='field' placeholder='Último nome' value={profileForm.lastName} onChange={(e) => setProfileForm((p) => ({ ...p, lastName: e.target.value }))} />
                <input className='field' placeholder='Telefone' value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} />
                <input className='field' placeholder='Nacionalidade' value={profileForm.nationality} onChange={(e) => setProfileForm((p) => ({ ...p, nationality: e.target.value }))} />
                <input className='field' placeholder='País' value={profileForm.country} onChange={(e) => setProfileForm((p) => ({ ...p, country: e.target.value }))} />
                <input className='field' placeholder='Estado' value={profileForm.state} onChange={(e) => setProfileForm((p) => ({ ...p, state: e.target.value }))} />
                <input className='field' placeholder='Cidade' value={profileForm.city} onChange={(e) => setProfileForm((p) => ({ ...p, city: e.target.value }))} />
                <input className='field' placeholder='CEP' value={profileForm.postalCode} onChange={(e) => setProfileForm((p) => ({ ...p, postalCode: e.target.value }))} />
                <input className='field md:col-span-2' placeholder='Endereço' value={profileForm.address} onChange={(e) => setProfileForm((p) => ({ ...p, address: e.target.value }))} />
                <input className='field' placeholder='Gênero' value={profileForm.gender} onChange={(e) => setProfileForm((p) => ({ ...p, gender: e.target.value }))} />
                <input className='field' placeholder='URL da foto (opcional)' value={profileForm.avatarUrl} onChange={(e) => setProfileForm((p) => ({ ...p, avatarUrl: e.target.value }))} />
                <input className='field bg-white/5 text-white/70' value={`CPF: ${user?.cpf ?? ''}`} readOnly />
                <input className='field bg-white/5 text-white/70' value={`Nascimento: ${user?.birthDate ? new Date(user.birthDate).toLocaleDateString('pt-BR') : ''}`} readOnly />
              </div>
              <button type='button' className='btn-primary mt-4' disabled={loading} onClick={saveProfile}>
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </article>
          </section>
        ) : null}

        {activeTab === 'saldo' ? (
          <section className='mt-6 rounded-2xl border border-white/10 bg-[#101525] p-5'>
            <h2 className='text-3xl font-bold'>Meu saldo</h2>
            <div className='mt-6 grid gap-4 md:grid-cols-2'>
              <div className='rounded-xl border border-white/10 bg-white/5 p-4'>
                <p className='text-xs uppercase tracking-[0.12em] text-white/60'>Saldo da conta</p>
                <p className='mt-2 text-3xl font-extrabold'>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: transactions?.wallet.currency ?? 'BRL' }).format(transactions?.wallet.balance ?? user?.wallet?.balance ?? 0)}
                </p>
              </div>
              <div className='rounded-xl border border-amber-300/30 bg-amber-500/10 p-4'>
                <p className='text-sm font-bold'>Depósito e saque</p>
                <p className='mt-2 text-sm text-white/75'>Em manutenção até integração de gateway (PIX / cartão).</p>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === 'historico' ? (
          <section className='mt-6 rounded-2xl border border-white/10 bg-[#101525] p-5'>
            <h2 className='text-3xl font-bold'>Histórico de apostas</h2>
            {!bets.length ? (
              <p className='mt-10 text-center text-white/70'>Você ainda não tem apostas registradas.</p>
            ) : (
              <div className='mt-5 space-y-3'>
                {bets.map((bet) => (
                  <article key={bet.id} className='rounded-xl border border-white/10 bg-white/5 p-4'>
                    <p className='text-sm text-white/70'>{new Date(bet.createdAt).toLocaleString('pt-BR')}</p>
                    <p className='mt-1 font-bold'>Stake: R$ {bet.stake.toFixed(2)} • Retorno potencial: R$ {bet.potentialWin.toFixed(2)}</p>
                    <p className='text-sm text-cyan-200'>Status: {traduzirStatusAposta(bet.status)}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'transacoes' ? (
          <section className='mt-6 grid gap-4 lg:grid-cols-[260px_1fr]'>
            <aside className='rounded-2xl border border-white/10 bg-[#101525] p-4'>
              <p className='text-sm font-bold'>Transações</p>
              <p className='mt-2 text-xs text-white/60'>Depósitos e saques</p>
              <div className='mt-4 space-y-2'>
                <div className='rounded-lg border border-amber-300/30 bg-amber-500/10 p-2 text-xs'>Depósito: Em manutenção</div>
                <div className='rounded-lg border border-amber-300/30 bg-amber-500/10 p-2 text-xs'>Saque: Em manutenção</div>
              </div>
            </aside>
            <article className='rounded-2xl border border-white/10 bg-[#101525] p-4'>
              <h2 className='text-2xl font-bold'>Extrato</h2>
              <div className='mt-4 grid gap-4 md:grid-cols-2'>
                <div>
                  <p className='text-sm font-bold'>Lançamentos da carteira</p>
                  <div className='mt-2 max-h-80 space-y-2 overflow-auto pr-1'>
                    {transactions?.ledger.length ? (
                      transactions.ledger.map((entry) => (
                        <p key={entry.id} className='rounded-lg border border-white/10 bg-white/5 p-2 text-sm'>
                          {traduzirTipoLedger(entry.type)} • R$ {entry.amount.toFixed(2)} • {new Date(entry.createdAt).toLocaleString('pt-BR')}
                        </p>
                      ))
                    ) : (
                      <p className='text-sm text-white/60'>Sem lançamentos.</p>
                    )}
                  </div>
                </div>
                <div>
                  <p className='text-sm font-bold'>Pagamentos</p>
                  <div className='mt-2 max-h-80 space-y-2 overflow-auto pr-1'>
                    {transactions?.payments.length ? (
                      transactions.payments.map((entry) => (
                        <p key={entry.id} className='rounded-lg border border-white/10 bg-white/5 p-2 text-sm'>
                          {traduzirTipoPagamento(entry.type)} • R$ {entry.amount.toFixed(2)} • {traduzirStatusPagamento(entry.status)}
                        </p>
                      ))
                    ) : (
                      <p className='text-sm text-white/60'>Sem pagamentos registrados.</p>
                    )}
                  </div>
                </div>
              </div>
            </article>
          </section>
        ) : null}
      </div>
    </main>
  );
}
