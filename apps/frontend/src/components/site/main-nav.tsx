'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-request';
import { clearClientSession, getStoredUser, logoutSession, SessionUser, setStoredUser } from '@/lib/auth';

import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

type NavLink = { href: string; label: string; requiresAuth?: boolean };

type SiteDisclaimer = {
  id: string;
  message: string;
  active: boolean;
  variant: string;
  scrolling: boolean;
  priority: number;
};

const VARIANT_STYLES: Record<string, string> = {
  amber: 'border-amber-400/30 bg-gradient-to-r from-amber-500/15 via-amber-400/20 to-amber-500/15 text-amber-100',
  red: 'border-red-400/30 bg-gradient-to-r from-red-500/15 via-red-400/20 to-red-500/15 text-red-100',
  blue: 'border-blue-400/30 bg-gradient-to-r from-blue-500/15 via-blue-400/20 to-blue-500/15 text-blue-100',
  emerald: 'border-emerald-400/30 bg-gradient-to-r from-emerald-500/15 via-emerald-400/20 to-emerald-500/15 text-emerald-100',
  violet: 'border-violet-400/30 bg-gradient-to-r from-violet-500/15 via-violet-400/20 to-violet-500/15 text-violet-100',
  neutral: 'border-white/15 bg-white/5 text-white/85',
};

const baseLinks: NavLink[] = [
  { href: '/', label: 'Início' },
  { href: '/apostas', label: 'Apostas' },
  { href: '/eventos', label: 'Eventos' },
  { href: '/listas', label: 'Listas Brasil' },
  { href: '/carteira', label: 'Carteira', requiresAuth: true },
];

type NavUser = SessionUser & {
  wallet?: { balance: number | string; currency: string };
  walletBalance?: number | string;
};

/** Suporta ambos shapes (login retorna walletBalance flat, /me retorna wallet aninhado) */
function getBalance(u: NavUser | null): number {
  if (!u) return 0;
  if (u.wallet?.balance !== undefined) return Number(u.wallet.balance);
  if (u.walletBalance !== undefined) return Number(u.walletBalance);
  return 0;
}

export function MainNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<NavUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const walletRef = useRef<HTMLDivElement | null>(null);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [disclaimers, setDisclaimers] = useState<SiteDisclaimer[]>([]);
  const fixedShellRef = useRef<HTMLDivElement | null>(null);
  const [shellHeight, setShellHeight] = useState(64);

  useEffect(() => {
    setUser(getStoredUser());
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${apiUrl}/site-disclaimers`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as SiteDisclaimer[];
        if (!cancelled) setDisclaimers(data);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Mede a altura real do header + disclaimers para o spacer ficar exato
  useEffect(() => {
    if (!fixedShellRef.current) return;
    const el = fixedShellRef.current;
    const update = () => setShellHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [disclaimers.length]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await apiFetch(`${apiUrl}/auth/me`, { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) {
          clearClientSession();
          setUser(null);
          return;
        }
        const data = (await res.json()) as NavUser;
        setStoredUser(data);
        setUser(data);

        // Profile guard: redireciona para completar-cadastro se faltar dados
        // em rotas que exigem perfil completo (deposito/saque/apostas/carteira)
        const protectedRoutes = ['/deposito', '/saque', '/apostas', '/carteira'];
        const inProtected = protectedRoutes.some((p) => pathname?.startsWith(p));
        if (inProtected && data.profileComplete === false) {
          router.push('/completar-cadastro');
        }
      } catch {
        // keep previous state
      }
    };
    void refresh();

    // Listener para atualizar saldo apos eventos do app (apostas, depositos)
    const handler = () => { void refresh(); };
    window.addEventListener('wallet:refresh', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('wallet:refresh', handler);
    };
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (walletRef.current && !walletRef.current.contains(event.target as Node)) {
        setWalletOpen(false);
      }
    }

    if (menuOpen || walletOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }

    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen, walletOpen]);

  // Bloqueia o scroll quando o menu mobile está aberto
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [mobileMenuOpen]);

  const links = useMemo(() => {
    const visible = baseLinks.filter((link) => !link.requiresAuth || !!user);
    if (user && user.role !== 'USER') {
      visible.push({ href: '/admin', label: 'Admin', requiresAuth: true });
    }
    return visible;
  }, [user]);

  async function logout() {
    await logoutSession();
    setUser(null);
    setMenuOpen(false);
    setMobileMenuOpen(false);
    router.push('/login');
  }

  return (
    <>
      {/* Disclaimer + Header fixos */}
      <div ref={fixedShellRef} className='fixed left-0 right-0 top-0 z-40 w-full'>
        {/* Disclaimers / avisos oficiais */}
        {disclaimers.map((d) => (
          <DisclaimerBar key={d.id} disclaimer={d} />
        ))}

        <header className='glass w-full transition-all duration-300'>
        <div className='mx-auto max-w-7xl px-3 flex h-16 sm:h-20 items-center justify-between sm:px-6 lg:px-8'>

          <div className='flex items-center gap-3 md:gap-6 min-w-0'>
            <Link
              href='/'
              className='flex items-center transition-opacity hover:opacity-80 shrink-0'
            >
              <Image
                src='/images/logoSemFundo.png'
                alt='201bet'
                width={360}
                height={104}
                priority
                className='h-20 sm:h-16 md:h-20 w-auto'
              />
            </Link>

            {/* Desktop Navigation */}
            <nav className='hidden items-center gap-8 text-sm font-medium text-white/50 md:flex'>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`transition-colors hover:text-white ${pathname === link.href ? 'text-white font-semibold' : ''}`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className='flex items-center gap-1.5 sm:gap-2 shrink-0'>
            {!user ? (
              <Link
                href='/login'
                className='rounded-full bg-white/10 px-4 py-1.5 sm:px-5 sm:py-2 text-xs sm:text-sm font-semibold transition hover:bg-white/20'
              >
                Entrar
              </Link>
            ) : (
              <>
                {/* Saldo Dropdown */}
                <div className='relative' ref={walletRef}>
                  <button
                    type='button'
                    onClick={() => { setWalletOpen((v) => !v); setMenuOpen(false); }}
                    className='flex items-center gap-1.5 sm:gap-2 rounded-full border border-[#d4a843]/30 bg-[#d4a843]/10 py-1 sm:py-1.5 pl-2 sm:pl-3 pr-2 sm:pr-3 transition hover:bg-[#d4a843]/20'
                  >
                    <svg className='h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#d4a843]' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                      <path strokeLinecap='round' strokeLinejoin='round' d='M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0121 6v0m0 6v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v6z' />
                    </svg>
                    <span className='text-[11px] sm:text-xs font-bold text-[#d4a843] whitespace-nowrap'>
                      {`R$ ${getBalance(user).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                    <svg className={`h-3 w-3 text-[#d4a843]/60 transition-transform duration-200 ${walletOpen ? 'rotate-180' : ''}`} fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2.5}>
                      <path strokeLinecap='round' strokeLinejoin='round' d='M19 9l-7 7-7-7' />
                    </svg>
                  </button>

                  <div className={`absolute right-0 top-11 z-50 w-60 transform rounded-2xl border border-white/15 bg-[#101525]/95 p-3 shadow-2xl backdrop-blur-md transition-all duration-200 ${walletOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'}`}>
                    <div className='rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-3'>
                      <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1'>Saldo total</p>
                      <p className='text-2xl font-bold text-[#d4a843]'>
                        {getBalance(user).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    </div>

                    <div className='flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 mb-3'>
                      <span className='text-xs text-white/40'>Saldo</span>
                      <span className='text-sm font-semibold'>
                        {getBalance(user).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>

                    <div className='grid grid-cols-2 gap-2'>
                      <Link
                        href='/deposito'
                        onClick={() => setWalletOpen(false)}
                        className='rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2.5 text-center text-xs font-bold text-emerald-400 transition-all hover:bg-emerald-500/20'
                      >
                        Depositar
                      </Link>
                      <Link
                        href='/saque'
                        onClick={() => setWalletOpen(false)}
                        className='rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-center text-xs font-bold text-white/80 transition-all hover:bg-white/10'
                      >
                        Sacar
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Conta Dropdown - escondido em mobile (acessivel via hamburger) */}
                <div className='relative hidden md:block' ref={menuRef}>
                  <button
                    type='button'
                    onClick={() => { setMenuOpen((v) => !v); setWalletOpen(false); }}
                    className='flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 transition hover:bg-white/10'
                  >
                    <span className='inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-300'>
                      {user.avatarUrl ? <img src={user.avatarUrl} alt='Avatar' className='h-full w-full object-cover' /> : user.name.slice(0, 1).toUpperCase()}
                    </span>
                  </button>

                  <div className={`absolute right-0 top-11 z-50 w-52 transform rounded-2xl border border-white/15 bg-[#101525]/95 p-2 shadow-2xl backdrop-blur-md transition-all duration-200 ${menuOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'}`}>
                    <div className='mb-2 px-3 py-2'>
                      <p className='truncate text-sm font-bold'>{user.name}</p>
                      <p className='truncate text-xs text-white/50'>{user.email}</p>
                    </div>
                    <div className='h-px bg-white/10 mb-1' />
                    <Link className='block rounded-xl px-3 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white' href='/carteira' onClick={() => setMenuOpen(false)}>Minha Conta</Link>
                    <Link className='block rounded-xl px-3 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white' href='/carteira?tab=transacoes' onClick={() => setMenuOpen(false)}>Transações</Link>
                    <div className='my-1 h-px bg-white/10' />
                    <button type='button' className='w-full rounded-xl px-3 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/15' onClick={logout}>
                      Sair
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Hamburger Button (Mobile) */}
            <button
              type='button'
              className='flex h-10 w-10 items-center justify-center rounded-full bg-white/5 transition hover:bg-white/10 md:hidden'
              onClick={() => setMobileMenuOpen(true)}
              aria-label='Abrir menu'
            >
              <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                <line x1='3' y1='12' x2='21' y2='12'></line>
                <line x1='3' y1='6' x2='21' y2='6'></line>
                <line x1='3' y1='18' x2='21' y2='18'></line>
              </svg>
            </button>
          </div>
        </div>
        </header>
      </div>

      {/* Mobile Menu Overlay */}
      <div 
        className={`fixed inset-0 z-50 bg-[#090b11] transition-transform duration-300 ease-in-out md:hidden ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className='flex h-16 items-center justify-between border-b border-white/5 px-4 sm:px-6'>
          <span className='text-lg font-bold tracking-wider text-white'>201BET</span>
          <button
            type='button'
            className='flex h-10 w-10 items-center justify-center rounded-full bg-white/5 transition hover:bg-white/10'
            onClick={() => setMobileMenuOpen(false)}
            aria-label='Fechar menu'
          >
            <svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
              <line x1='18' y1='6' x2='6' y2='18'></line>
              <line x1='6' y1='6' x2='18' y2='18'></line>
            </svg>
          </button>
        </div>
        
        <div className='flex flex-col h-[calc(100vh-4rem)] overflow-y-auto'>
          {user && (
            <div className='border-b border-white/5 px-6 py-4'>
              <div className='flex items-center gap-3'>
                <span className='inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-emerald-500/20 text-base font-bold text-emerald-300'>
                  {user.avatarUrl ? <img src={user.avatarUrl} alt='Avatar' className='h-full w-full object-cover' /> : user.name.slice(0, 1).toUpperCase()}
                </span>
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-bold'>{user.name}</p>
                  <p className='truncate text-xs text-white/50'>{user.email}</p>
                </div>
              </div>
              <div className='mt-3 rounded-xl border border-[#d4a843]/30 bg-[#d4a843]/10 px-4 py-3'>
                <p className='text-[10px] font-semibold uppercase tracking-widest text-[#d4a843]/70'>Saldo</p>
                <p className='text-xl font-bold text-[#d4a843]'>
                  {getBalance(user).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
                <div className='mt-2 grid grid-cols-2 gap-2'>
                  <Link
                    href='/deposito'
                    onClick={() => setMobileMenuOpen(false)}
                    className='rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center text-xs font-bold text-emerald-400 hover:bg-emerald-500/20'
                  >
                    Depositar
                  </Link>
                  <Link
                    href='/saque'
                    onClick={() => setMobileMenuOpen(false)}
                    className='rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center text-xs font-bold text-white/80 hover:bg-white/10'
                  >
                    Sacar
                  </Link>
                </div>
              </div>
            </div>
          )}
          <nav className='flex flex-col gap-1 p-4 sm:p-6 flex-1'>
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`rounded-xl px-4 py-3 text-base font-medium transition-all ${pathname === link.href ? 'bg-white/10 text-white border-l-2 border-white' : 'text-white/60 hover:text-white hover:bg-white/5 border-l-2 border-transparent'}`}
              >
                {link.label}
              </Link>
            ))}
            {!user && (
              <Link
                href='/login'
                onClick={() => setMobileMenuOpen(false)}
                className='mt-3 rounded-xl bg-white px-4 py-3 text-center text-base font-bold text-black hover:bg-white/90'
              >
                Entrar
              </Link>
            )}
          </nav>
          {user && (
            <div className='border-t border-white/5 p-4 sm:p-6 space-y-1'>
              <Link
                href='/carteira?tab=transacoes'
                onClick={() => setMobileMenuOpen(false)}
                className='block rounded-xl px-4 py-3 text-sm text-white/70 hover:bg-white/5 hover:text-white'
              >
                Transações
              </Link>
              <button
                type='button'
                onClick={logout}
                className='w-full rounded-xl px-4 py-3 text-left text-sm font-medium text-red-400 hover:bg-red-500/10'
              >
                Sair
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Spacer para o fixed header (+ disclaimers) não cobrir conteúdo principal */}
      <div className='w-full shrink-0' style={{ height: `${shellHeight}px` }} />
      <style jsx global>{`
        @keyframes site-disclaimer-marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .site-disclaimer-marquee {
          display: inline-block;
          white-space: nowrap;
          padding-left: 100%;
          animation: site-disclaimer-marquee 22s linear infinite;
        }
      `}</style>
    </>
  );
}

function DisclaimerBar({ disclaimer }: { disclaimer: SiteDisclaimer }) {
  const variantClass = VARIANT_STYLES[disclaimer.variant] ?? VARIANT_STYLES.amber;
  return (
    <div className={`border-b backdrop-blur-md ${variantClass}`}>
      <div className='mx-auto flex max-w-7xl items-center gap-2 overflow-hidden px-3 py-1.5 sm:gap-3 sm:px-6 sm:py-2 lg:px-8'>
        <svg className='hidden h-4 w-4 shrink-0 sm:inline opacity-80' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2.2}>
          <path strokeLinecap='round' strokeLinejoin='round' d='M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' />
        </svg>
        {disclaimer.scrolling ? (
          <div className='flex-1 overflow-hidden text-[11px] font-semibold leading-tight sm:text-xs sm:leading-normal'>
            <span className='site-disclaimer-marquee'>{disclaimer.message}</span>
          </div>
        ) : (
          <p className='flex-1 text-center text-[11px] font-semibold leading-tight sm:text-xs sm:leading-normal'>
            {disclaimer.message}
          </p>
        )}
      </div>
    </div>
  );
}
