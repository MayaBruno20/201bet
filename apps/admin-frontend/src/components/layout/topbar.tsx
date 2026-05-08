'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { I } from '../ui/icons';
import { getStoredAdminUser, logout } from '@/lib/auth';

type Props = { openCmdK: () => void };

export const Topbar: React.FC<Props> = ({ openCmdK }) => {
  const router = useRouter();
  const [user, setUser] = React.useState<{ email: string; role: string } | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const u = getStoredAdminUser();
    if (u) setUser({ email: u.email, role: u.role });
  }, []);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <header className="h-[68px] flex items-center gap-3 px-7 shrink-0"
      style={{ borderBottom: '1px solid var(--border)', background: 'rgba(7,8,12,0.7)', backdropFilter: 'blur(8px)' }}>
      <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-3)]">
        <span className="text-[color:var(--text-2)]">Admin</span>
        <I.ChevronRight size={13}/>
        <span className="text-[color:var(--text)] font-medium">Visão geral</span>
      </div>
      <div className="flex-1"/>
      <button onClick={openCmdK} className="btn btn-ghost focusable" style={{ paddingLeft: 12, paddingRight: 12 }}>
        <I.Search size={15}/>
        <span className="text-[color:var(--text-3)] font-medium">Buscar pilotos, eventos…</span>
        <span className="flex items-center gap-1 ml-2"><kbd>⌘</kbd><kbd>K</kbd></span>
      </button>
      <div className="h-7 w-px" style={{ background: 'var(--border)' }}/>
      <button className="btn-icon focusable relative" title="Notificações">
        <I.Bell size={17}/>
        <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)' }}/>
      </button>
      <Link href="/eventos" className="btn btn-primary focusable">
        <I.Plus size={15}/> Novo evento
      </Link>

      {/* Avatar + menu de usuário (logado) */}
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2 rounded-[12px] px-2 py-1.5 hover:bg-[color:var(--surface-2)] transition-colors"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <div className="w-8 h-8 rounded-full grid place-items-center text-[12px] font-bold"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', color: '#1a1106' }}>
            {user?.email?.[0]?.toUpperCase() ?? '?'}
          </div>
          <I.ChevronRight size={12} style={{ color: 'var(--text-3)', transform: menuOpen ? 'rotate(90deg)' : 'rotate(90deg)' }}/>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-2 min-w-[220px] rounded-[12px] py-2 z-50"
            style={{ background: 'var(--surface)', border: '1px solid var(--border-strong)', boxShadow: '0 20px 50px -20px rgba(0,0,0,0.6)' }}>
            {user && (
              <>
                <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-[12px] font-semibold truncate">{user.email}</div>
                  <div className="text-[10.5px] tracking-[0.14em] uppercase font-semibold mt-0.5" style={{ color: 'var(--accent)' }}>{user.role}</div>
                </div>
              </>
            )}
            <Link href="/seguranca" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-[color:var(--surface-2)]">
              <I.Shield size={14}/> Segurança & 2FA
            </Link>
            <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-[color:var(--rose-soft)] hover:text-[color:var(--rose)] text-left">
              <I.X size={14}/> Sair
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
