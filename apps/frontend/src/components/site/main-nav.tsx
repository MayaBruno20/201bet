'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { clearAuthToken, getAuthToken, getStoredUser, SessionUser, setStoredUser } from '@/lib/auth';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3502/api';

type NavLink = { href: string; label: string; requiresAuth?: boolean };

const baseLinks: NavLink[] = [
  { href: '/', label: 'INICIO' },
  { href: '/apostas', label: 'APOSTAS' },
  { href: '/eventos', label: 'EVENTOS' },
  { href: '/carteira', label: 'CARTEIRA', requiresAuth: true },
];

type NavUser = SessionUser & {
  wallet?: { balance: number | string; currency: string };
};

export function MainNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<NavUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
    }

    if (menuOpen) {
      window.addEventListener('mousedown', handleClickOutside);
    }

    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const links = useMemo(() => {
    const visible = baseLinks.filter((link) => !link.requiresAuth || !!user);
    if (user && user.role !== 'USER') {
      visible.push({ href: '/admin', label: 'ADMIN', requiresAuth: true });
    }
    return visible;
  }, [user]);

  function logout() {
    clearAuthToken();
    setUser(null);
    setMenuOpen(false);
    router.push('/login');
  }

  return (
    <header className='mb-10 flex flex-wrap items-center justify-between gap-3'>
      <div className='flex items-center gap-3'>
        <Link href='/' className='rounded-xl bg-white/10 px-3 py-2 text-lg font-extrabold tracking-widest text-amber-300'>
          201BET
        </Link>

        <nav className='hidden items-center gap-6 text-sm font-semibold text-white/80 md:flex'>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`transition hover:text-white ${pathname === link.href ? 'text-white' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className='relative flex items-center gap-3' ref={menuRef}>
        {!user ? (
          <Link href='/login' className='rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20'>
            Entrar
          </Link>
        ) : (
          <>
            <button
              type='button'
              onClick={() => setMenuOpen((v) => !v)}
              className='flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm hover:bg-white/20'
            >
              <span className='inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-cyan-500/30 text-xs font-extrabold'>
                {user.avatarUrl ? <img src={user.avatarUrl} alt='Avatar do usuário' className='h-full w-full object-cover' /> : user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className='hidden max-w-40 truncate text-xs font-semibold md:block'>
                {user.name}
                {user.wallet ? ` • R$ ${Number(user.wallet.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
              </span>
            </button>

            {menuOpen ? (
              <div className='absolute right-0 top-11 z-50 w-56 rounded-xl border border-white/15 bg-[#101525] p-2 shadow-2xl'>
                <Link className='block rounded-lg px-3 py-2 text-sm hover:bg-white/10' href='/carteira' onClick={() => setMenuOpen(false)}>
                  Conta
                </Link>
                <Link className='block rounded-lg px-3 py-2 text-sm hover:bg-white/10' href='/carteira?tab=saldo' onClick={() => setMenuOpen(false)}>
                  Meu saldo
                </Link>
                <Link className='block rounded-lg px-3 py-2 text-sm hover:bg-white/10' href='/carteira?tab=transacoes' onClick={() => setMenuOpen(false)}>
                  Transações
                </Link>
                <Link className='block rounded-lg px-3 py-2 text-sm hover:bg-white/10' href='/carteira?tab=historico' onClick={() => setMenuOpen(false)}>
                  Histórico
                </Link>
                <div className='my-2 h-px bg-white/10' />
                <button type='button' className='w-full rounded-lg px-3 py-2 text-left text-sm text-red-200 hover:bg-red-500/15' onClick={logout}>
                  Sair
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </header>
  );
}
