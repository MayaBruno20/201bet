'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { MainNav } from '@/components/site/main-nav';
import { VerificationBanner } from '@/components/site/verification-banner';
import { apiFetch } from '@/lib/api-request';
import { clearClientSession, getStoredUser, SessionUser, setStoredUser } from '@/lib/auth';

import { getPublicApiUrl } from '@/lib/env-public';
import { maskCEP, maskPhone, maskCPF } from '@/lib/masks';

const apiUrl = getPublicApiUrl();
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
  const [user, setUser] = useState<MeResponse | null>(null);
  const [transactions, setTransactions] = useState<MyTransactions | null>(null);
  const [bets, setBets] = useState<MyBet[]>([]);
  const [activeTab, setActiveTab] = useState<UserTab>('conta');
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);

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
    if (typeof window === 'undefined') return;
    const tabFromQuery = new URLSearchParams(window.location.search).get('tab');
    if (tabFromQuery === 'saldo' || tabFromQuery === 'historico' || tabFromQuery === 'transacoes' || tabFromQuery === 'conta') {
      setActiveTab(tabFromQuery);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setStatusMessage('');
      try {
        const [meRes, transRes, betsRes] = await Promise.all([
          apiFetch(`${apiUrl}/auth/me`, { cache: 'no-store' }),
          apiFetch(`${apiUrl}/auth/my-transactions`, { cache: 'no-store' }),
          apiFetch(`${apiUrl}/auth/my-bets`, { cache: 'no-store' }),
        ]);

        if (!meRes.ok) {
          clearClientSession();
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
          emailVerified: me.emailVerified,
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
  }, []);

  const displayName = useMemo(() => {
    if (!user) return 'Usuário';
    return user.firstName?.trim() || user.name;
  }, [user]);

  async function saveProfile() {
    setLoading(true);
    setStatusMessage('');
    try {
      const res = await apiFetch(`${apiUrl}/auth/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
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
        emailVerified: updated.emailVerified,
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

    if (file.size > 5_000_000) {
      setStatusMessage('Imagem muito grande. Use arquivo de até 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') return;

      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 256;
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setStatusMessage('Não foi possível processar a imagem.');
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        setProfileForm((prev) => ({ ...prev, avatarUrl: compressed }));
      };
      img.onerror = () => setStatusMessage('Arquivo de imagem inválido.');
      img.src = result;
    };
    reader.readAsDataURL(file);
  }

  async function fetchCEP(cep: string) {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;

    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json() as { erro?: boolean; uf?: string; localidade?: string; logradouro?: string; bairro?: string };
      if (data.erro) {
        setStatusMessage('CEP não encontrado.');
        return;
      }

      setProfileForm((prev) => ({
        ...prev,
        state: data.uf || prev.state,
        city: data.localidade || prev.city,
        address: [data.logradouro, data.bairro].filter(Boolean).join(', ') || prev.address,
      }));
    } catch {
      // silently fail — user can fill manually
    }
  }

  if (loading) {
    return (
      <main className='min-h-screen bg-[#090b11] text-white'>
        <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
          <MainNav />
          <p className='mt-10 text-center text-white/50'>Carregando…</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className='min-h-screen bg-[#090b11] text-white'>
        <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
          <MainNav />
          <section className='mt-8 rounded-3xl border border-white/10 bg-amber-500/5 p-4 sm:p-6 backdrop-blur-md'>
            <h1 className='text-2xl font-semibold'>Login necessário</h1>
            <p className='mt-2 text-white/50'>Entre com sua conta para acessar o painel do usuário.</p>
            <a href='/login' className='mt-4 inline-flex rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]'>Ir para login</a>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className='min-h-screen bg-[#090b11] pb-10 text-white'>
      <div className='mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8'>
        <MainNav />

        <VerificationBanner hidden={user?.emailVerified === true} />

        <section className='rounded-3xl border border-white/10 bg-[#101525] p-5 backdrop-blur-md'>
          <div className='flex flex-wrap items-center gap-4'>
            <div className='h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-white/5'>
              {profileForm.avatarUrl ? (
                <img src={profileForm.avatarUrl} alt='Avatar do usuário' className='h-full w-full object-cover' />
              ) : (
                <div className='flex h-full w-full items-center justify-center text-xl font-semibold text-white/60'>{displayName.slice(0, 1).toUpperCase()}</div>
              )}
            </div>
            <div>
              <p className='text-lg font-medium'>{displayName}</p>
              <p className='text-sm text-white/40'>{user?.email}</p>
            </div>
          </div>

          {/* Mobile: Dropdown selector */}
          <div className='mt-6 border-t border-white/5 pt-4 md:hidden'>
            <button
              type='button'
              onClick={() => setTabMenuOpen((v) => !v)}
              className='flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium transition-all hover:bg-white/10'
            >
              <div className='flex items-center gap-3'>
                <span className='h-2 w-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]' />
                {TAB_LABELS[activeTab]}
              </div>
              <svg className={`h-4 w-4 text-white/40 transition-transform duration-300 ${tabMenuOpen ? 'rotate-180' : ''}`} fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M19 9l-7 7-7-7' />
              </svg>
            </button>
            
            <div className={`mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#101525] transition-all duration-300 ease-out ${tabMenuOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0 border-transparent'}`}>
              {(Object.keys(TAB_LABELS) as UserTab[]).map((tab) => (
                <button
                  key={tab}
                  type='button'
                  onClick={() => { setActiveTab(tab); setTabMenuOpen(false); }}
                  className={`flex w-full items-center gap-3 px-4 py-3.5 text-sm font-medium transition-colors ${activeTab === tab ? 'bg-white/5 text-white' : 'text-white/40 hover:bg-white/5 hover:text-white/70'}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full transition-all ${activeTab === tab ? 'bg-white scale-100' : 'bg-transparent scale-0'}`} />
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop: Pill buttons */}
          <div className='mt-6 hidden md:flex flex-wrap gap-2 border-t border-white/5 pt-4'>
            {(Object.keys(TAB_LABELS) as UserTab[]).map((tab) => (
              <button
                key={tab}
                type='button'
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ${activeTab === tab ? 'bg-white text-black shadow-lg' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'}`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </section>

        {statusMessage ? <p className='mt-4 rounded-lg border border-white/15 bg-white/5 p-2 text-sm'>{statusMessage}</p> : null}

        {activeTab === 'conta' ? (
          <section className='mt-6 grid gap-4 lg:grid-cols-[280px_1fr]'>
            <aside className='rounded-3xl border border-white/10 bg-[#101525] p-5 backdrop-blur-md flex flex-col items-center'>
              {/* Avatar com preview */}
              <div className='relative'>
                {profileForm.avatarUrl ? (
                  <img src={profileForm.avatarUrl} alt='Avatar' className='h-24 w-24 rounded-full object-cover border-2 border-white/10' />
                ) : (
                  <div className='h-24 w-24 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold text-white/40'>
                    {displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <label className='absolute bottom-0 right-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white text-black hover:bg-white/90 transition-colors shadow-lg touch-manipulation'>
                  <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
                    <path d='M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z' />
                    <circle cx='12' cy='13' r='4' />
                  </svg>
                  <input type='file' accept='image/*' className='hidden' onChange={onAvatarUpload} />
                </label>
              </div>
              <p className='mt-4 text-lg font-semibold text-center'>{displayName}</p>
              <p className='text-sm text-white/40'>{user?.email}</p>
              {profileForm.avatarUrl && (
                <button
                  type='button'
                  className='mt-3 text-xs text-red-400/70 hover:text-red-400 transition-colors'
                  onClick={() => setProfileForm((p) => ({ ...p, avatarUrl: '' }))}
                >
                  Remover foto
                </button>
              )}
            </aside>

            <article className='rounded-3xl border border-white/10 bg-[#101525] p-5 backdrop-blur-md'>
              <h2 className='text-2xl font-semibold tracking-tight'>Informações da Conta</h2>
              <div className='mt-4 grid gap-3 md:grid-cols-2'>
                <input className='field' placeholder='Primeiro nome' value={profileForm.firstName} onChange={(e) => setProfileForm((p) => ({ ...p, firstName: e.target.value }))} />
                <input className='field' placeholder='Último nome' value={profileForm.lastName} onChange={(e) => setProfileForm((p) => ({ ...p, lastName: e.target.value }))} />
                <input className='field' placeholder='Telefone' inputMode='tel' value={maskPhone(profileForm.phone)} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 11) }))} />
                <input className='field' placeholder='Nacionalidade' value={profileForm.nationality} onChange={(e) => setProfileForm((p) => ({ ...p, nationality: e.target.value }))} />

                <div className='md:col-span-2 mt-2'>
                  <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2'>Endereço</p>
                </div>

                <input
                  className='field'
                  placeholder='CEP'
                  inputMode='numeric'
                  value={maskCEP(profileForm.postalCode)}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '').slice(0, 8);
                    setProfileForm((p) => ({ ...p, postalCode: raw }));
                    if (raw.length === 8) void fetchCEP(raw);
                  }}
                />
                <input className='field' placeholder='Estado' value={profileForm.state} onChange={(e) => setProfileForm((p) => ({ ...p, state: e.target.value }))} />
                <input className='field' placeholder='Cidade' value={profileForm.city} onChange={(e) => setProfileForm((p) => ({ ...p, city: e.target.value }))} />
                <input className='field' placeholder='País' value={profileForm.country} onChange={(e) => setProfileForm((p) => ({ ...p, country: e.target.value }))} />
                <input className='field md:col-span-2' placeholder='Endereço completo (rua, número, bairro)' value={profileForm.address} onChange={(e) => setProfileForm((p) => ({ ...p, address: e.target.value }))} />

                <div className='md:col-span-2 mt-2'>
                  <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2'>Outros</p>
                </div>

                <input className='field' placeholder='Gênero' value={profileForm.gender} onChange={(e) => setProfileForm((p) => ({ ...p, gender: e.target.value }))} />
                <input className='field bg-white/[0.03] text-white/50 cursor-not-allowed' value={`CPF: ${user?.cpf ? maskCPF(user.cpf) : ''}`} readOnly />
                <input className='field bg-white/[0.03] text-white/50 cursor-not-allowed' value={`Nascimento: ${user?.birthDate ? new Date(user.birthDate).toLocaleDateString('pt-BR') : ''}`} readOnly />
              </div>
              <button type='button' className='w-full sm:w-auto rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all hover:shadow-[0_0_25px_rgba(255,255,255,0.2)] hover:scale-[1.01] disabled:opacity-50 mt-5' disabled={loading} onClick={saveProfile}>
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </article>
          </section>
        ) : null}

        {activeTab === 'saldo' ? (
          <section className='mt-6 rounded-3xl border border-white/10 bg-[#101525] p-4 sm:p-6 backdrop-blur-md'>
            <h2 className='text-2xl font-semibold tracking-tight'>Meu saldo</h2>
            <div className='mt-6 grid gap-4 md:grid-cols-2'>
              <div className='rounded-2xl border border-white/10 bg-white/[0.04] p-5'>
                <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2'>Saldo da conta</p>
                <p className='mt-3 text-3xl font-semibold'>
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: transactions?.wallet.currency ?? 'BRL' }).format(transactions?.wallet.balance ?? user?.wallet?.balance ?? 0)}
                </p>
              </div>
              <div className='rounded-2xl border border-white/10 bg-white/[0.04] p-5'>
                <p className='text-sm font-medium mb-3'>Ações rápidas</p>
                <div className='flex gap-2'>
                  <a href='/deposito' className='flex-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 text-center text-sm font-semibold text-emerald-400 transition-all hover:bg-emerald-500/20'>Depositar</a>
                  <a href='/saque' className='flex-1 rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-2.5 text-center text-sm font-semibold text-blue-400 transition-all hover:bg-blue-500/20'>Sacar</a>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === 'historico' ? (
          <section className='mt-6 rounded-3xl border border-white/10 bg-[#101525] p-4 sm:p-6 backdrop-blur-md'>
            <h2 className='text-2xl font-semibold tracking-tight'>Histórico de apostas</h2>
            {!bets.length ? (
              <div className='mt-10 rounded-2xl border border-dashed border-white/10 p-8 text-center'>
                <p className='text-white/40'>Você ainda não tem apostas registradas.</p>
              </div>
            ) : (
              <div className='mt-5 space-y-3'>
                {bets.map((bet) => (
                  <article key={bet.id} className='rounded-2xl border border-white/8 bg-gradient-to-br from-white/[0.04] to-transparent p-5 transition-colors hover:border-white/15'>
                    <p className='text-xs text-white/40'>{new Date(bet.createdAt).toLocaleString('pt-BR')}</p>
                    <p className='mt-1 font-medium'>R$ {bet.stake.toFixed(2)} <span className='text-white/40 mx-1'>•</span> Retorno: <span className='text-emerald-400'>R$ {bet.potentialWin.toFixed(2)}</span></p>
                    <p className='text-sm text-white/50'>Status: {traduzirStatusAposta(bet.status)}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activeTab === 'transacoes' ? (
          <section className='mt-6 space-y-6'>
            {/* Actions Panel */}
            <div className='rounded-2xl border border-white/10 bg-[#101525] p-5'>
              <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-3'>Ações financeiras</p>
              <div className='grid gap-3 sm:grid-cols-2'>
                <a href='/deposito' className='rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-4 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/5'>
                  <div className='h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0'>
                    <svg className='h-5 w-5 text-emerald-400' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                      <path strokeLinecap='round' strokeLinejoin='round' d='M12 4v16m8-8H4' />
                    </svg>
                  </div>
                  <div className='min-w-0'>
                    <p className='font-medium text-sm'>Depósito</p>
                    <p className='text-xs text-emerald-400/80'>Depositar via PIX</p>
                  </div>
                </a>
                <a href='/saque' className='rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center gap-4 transition-all hover:border-blue-500/30 hover:bg-blue-500/5'>
                  <div className='h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0'>
                    <svg className='h-5 w-5 text-blue-400' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                      <path strokeLinecap='round' strokeLinejoin='round' d='M19 14l-7 7m0 0l-7-7m7 7V3' />
                    </svg>
                  </div>
                  <div className='min-w-0'>
                    <p className='font-medium text-sm'>Saque</p>
                    <p className='text-xs text-blue-400/80'>Solicitar saque</p>
                  </div>
                </a>
              </div>
            </div>

            {/* Ledger & Payments */}
            <div className='rounded-3xl border border-white/10 bg-[#101525] overflow-hidden'>
              <div className='p-4 sm:p-6'>
                <h2 className='text-xl font-semibold tracking-tight'>Extrato</h2>
              </div>
              
              <div className='grid gap-0 md:grid-cols-2'>
                {/* Ledger */}
                <div className='border-t border-white/5 md:border-r md:border-t-0 p-4 sm:p-6'>
                  <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-4'>Lançamentos</p>
                  <div className='max-h-80 space-y-2 overflow-auto pr-1'>
                    {transactions?.ledger.length ? (
                      transactions.ledger.map((entry) => (
                        <div key={entry.id} className='rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-3 flex items-center justify-between gap-3'>
                          <div className='min-w-0'>
                            <p className='text-sm font-medium truncate'>{traduzirTipoLedger(entry.type)}</p>
                            <p className='text-[10px] text-white/30 mt-0.5'>{new Date(entry.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <span className={`shrink-0 text-sm font-semibold ${entry.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {entry.amount >= 0 ? '+' : ''}R$ {entry.amount.toFixed(2)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className='text-sm text-white/30 text-center py-6'>Sem lançamentos.</p>
                    )}
                  </div>
                </div>

                {/* Payments */}
                <div className='border-t border-white/5 p-4 sm:p-6'>
                  <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-4'>Pagamentos</p>
                  <div className='max-h-80 space-y-2 overflow-auto pr-1'>
                    {transactions?.payments.length ? (
                      transactions.payments.map((entry) => (
                        <div key={entry.id} className='rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-transparent p-3 flex items-center justify-between gap-3'>
                          <div className='min-w-0'>
                            <p className='text-sm font-medium truncate'>{traduzirTipoPagamento(entry.type)}</p>
                            <p className='text-[10px] text-white/30 mt-0.5'>R$ {entry.amount.toFixed(2)}</p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider ${
                            entry.status === 'APPROVED' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                            : entry.status === 'PENDING' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                            : 'bg-white/10 text-white/50 border-white/10'
                          }`}>
                            {traduzirStatusPagamento(entry.status)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className='text-sm text-white/30 text-center py-6'>Sem pagamentos registrados.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
