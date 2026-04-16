'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { clearAuthToken, getAuthToken, getStoredUser, SessionUser, setStoredUser } from '@/lib/auth';

import { getPublicApiUrl } from '@/lib/env-public';

const apiUrl = getPublicApiUrl();

type NavLink = { href: string; label: string; requiresAuth?: boolean };

const baseLinks: NavLink[] = [
  { href: '/', label: 'Início' },
  { href: '/apostas', label: 'Apostas' },
  { href: '/eventos', label: 'Eventos' },
  { href: '/carteira', label: 'Carteira', requiresAuth: true },
];

type NavUser = SessionUser & {
  wallet?: { balance: number | string; currency: string };
};

export function MainNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<NavUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const walletRef = useRef<HTMLDivElement | null>(null);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
  }, [pathname]);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      return;
    }

    void (async () => {
      try {
        const res = await fetch(`${apiUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });

        if (!res.ok) {
          clearAuthToken();
          setUser(null);
          return;
        }

        const data = (await res.json()) as NavUser;
        setStoredUser(data);
        setUser(data);
      } catch {
        // keep previous state if backend is temporarily unavailable
      }
    })();
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

  function logout() {
    clearAuthToken();
    setUser(null);
    setMenuOpen(false);
    setMobileMenuOpen(false);
    router.push('/login');
  }

  return (
    <>
      {/* Header Fixo Desktop/Mobile */}
      <header className='fixed left-0 right-0 top-0 z-40 glass w-full transition-all duration-300'>
        <div className='mx-auto max-w-7xl px-4 flex h-16 items-center justify-between sm:px-6 lg:px-8'>
          
          <div className='flex items-center gap-6'>
            <Link 
              href='/' 
              className='flex items-center gap-1 transition-opacity hover:opacity-70'
            >
              <svg viewBox='0 0 120 36' className='h-10 w-auto' fill='none' xmlns='http://www.w3.org/2000/svg'>
                <defs>
                  <linearGradient id='logoGrad' x1='0%' y1='0%' x2='100%' y2='100%'>
                    <stop offset='0%' stopColor='white' />
                    <stop offset='100%' stopColor='#93C5FD' />
                  </linearGradient>
                </defs>
                {/* Blue speed accent */}
                <rect x='0' y='14' width='14' height='3' rx='1.5' fill='#3B82F6' opacity='0.8' />
                <rect x='3' y='20' width='8' height='2' rx='1' fill='#3B82F6' opacity='0.4' />
                {/* 201 bold with gradient */}
                <text x='18' y='26' fontFamily='Inter, system-ui, sans-serif' fontSize='22' fontWeight='800' fill='url(#logoGrad)' letterSpacing='-0.5'>201</text>
                {/* BET lighter, closer */}
                <text x='66' y='26' fontFamily='Inter, system-ui, sans-serif' fontSize='22' fontWeight='400' fill='rgba(255,255,255,0.5)' letterSpacing='0.5'>BET</text>
              </svg>
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

          <div className='flex items-center gap-2'>
            {!user ? (
              <Link
                href='/login'
                className='rounded-full bg-white/10 px-5 py-2 text-sm font-semibold transition hover:bg-white/20'
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
                    className='flex items-center gap-2 rounded-full border border-[#d4a843]/30 bg-[#d4a843]/10 py-1.5 pl-3 pr-3 transition hover:bg-[#d4a843]/20'
                  >
                    <svg className='h-4 w-4 text-[#d4a843]' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                      <path strokeLinecap='round' strokeLinejoin='round' d='M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0121 6v0m0 6v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6v6z' />
                    </svg>
                    <span className='text-xs font-bold text-[#d4a843]'>
                      {user.wallet ? `R$ ${Number(user.wallet.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ 0,00'}
                    </span>
                    <svg className={`h-3 w-3 text-[#d4a843]/60 transition-transform duration-200 ${walletOpen ? 'rotate-180' : ''}`} fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2.5}>
                      <path strokeLinecap='round' strokeLinejoin='round' d='M19 9l-7 7-7-7' />
                    </svg>
                  </button>

                  <div className={`absolute right-0 top-11 z-50 w-60 transform rounded-2xl border border-white/15 bg-[#101525]/95 p-3 shadow-2xl backdrop-blur-md transition-all duration-200 ${walletOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'}`}>
                    <div className='rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-3'>
                      <p className='text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-1'>Saldo total</p>
                      <p className='text-2xl font-bold text-[#d4a843]'>
                        {user.wallet ? Number(user.wallet.balance).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'}
                      </p>
                    </div>

                    <div className='flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 mb-3'>
                      <span className='text-xs text-white/40'>Saldo</span>
                      <span className='text-sm font-semibold'>
                        {user.wallet ? Number(user.wallet.balance).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00'}
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

                {/* Conta Dropdown */}
                <div className='relative' ref={menuRef}>
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
        
        <nav className='flex flex-col gap-2 p-6'>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`rounded-2xl px-4 py-4 text-lg font-medium transition-all duration-300 ${pathname === link.href ? 'bg-white/5 text-white border-l-2 border-white' : 'text-white/40 hover:text-white/80 border-l-2 border-transparent'}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Spacer para o fixed header não cobrir conteúdo principal */}
      <div className='h-16 w-full shrink-0'></div>
    </>
  );
}
