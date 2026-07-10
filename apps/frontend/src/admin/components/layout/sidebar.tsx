'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { I, type IconName } from '../ui/icons';
import { Avatar } from '../ui/primitives';
import { NAV } from '@admin/lib/data';

type Props = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  openCmdK: () => void;
};

export const Sidebar: React.FC<Props> = ({ collapsed, setCollapsed, mobileOpen, setMobileOpen, openCmdK }) => {
  const pathname = usePathname();
  const groups: Record<string, typeof NAV> = {};
  NAV.forEach((it) => { (groups[it.group] ||= []).push(it); });

  // Fecha o drawer mobile ao navegar.
  React.useEffect(() => { setMobileOpen(false); }, [pathname, setMobileOpen]);

  // No drawer mobile a sidebar é sempre expandida; o modo recolhido só existe no desktop.
  const isCollapsed = collapsed && !mobileOpen;

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition-opacity duration-300 lg:hidden ${mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={`flex flex-col shrink-0 transition-all duration-300 fixed inset-y-0 left-0 z-50 lg:static lg:z-auto lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ width: isCollapsed ? 76 : 248, maxWidth: '85vw', background: 'var(--bg-2)', borderRight: '1px solid var(--border)' }}>
        <div className="h-[68px] flex items-center px-4 gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="w-9 h-9 rounded-[12px] grid place-items-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #ffc55a, #ff7a1a)', boxShadow: '0 8px 22px -10px rgba(255,138,42,0.6)' }}>
            <I.Flame size={18} stroke={2} style={{ color: '#1a1106' }}/>
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="font-display text-[15px] font-bold leading-tight">Palpite<span className="accent-text">201</span></div>
              <div className="text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--text-3)] font-semibold">Admin Console</div>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="btn-icon focusable lg-up" title={isCollapsed ? 'Expandir' : 'Recolher'}>
            {isCollapsed ? <I.ChevronRight size={16}/> : <I.ChevronLeft size={16}/>}
          </button>
          <button onClick={() => setMobileOpen(false)} className="btn-icon focusable lg-down" title="Fechar menu">
            <I.X size={16}/>
          </button>
        </div>

        <div className="px-3 pt-3">
          <button onClick={openCmdK}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-[12px] text-left text-[13px]"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
            <I.Search size={15}/>
            {!isCollapsed && <span className="flex-1">Buscar…</span>}
            {!isCollapsed && <span className="lg-up flex items-center gap-1"><kbd>⌘</kbd><kbd>K</kbd></span>}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 no-scrollbar">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              {!isCollapsed && <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[color:var(--text-4)] px-3 mb-2">{group}</div>}
              <div className="space-y-1">
                {items.map((it) => {
                  const Ico = (I[it.icon as IconName] as React.FC<{ size?: number }>) || I.Dashboard;
                  const isActive = pathname === it.href || (it.href !== '/dashboard' && pathname.startsWith(it.href));
                  return (
                    <Link key={it.id} href={it.href}
                      className={`nav-item w-full focusable ${isActive ? 'active' : ''}`}
                      title={isCollapsed ? it.label : undefined}>
                      <Ico size={17}/>
                      {!isCollapsed && <span className="flex-1 text-left">{it.label}</span>}
                      {!isCollapsed && it.badge && (
                        <span className="chip" style={{ background: 'var(--rose-soft)', color: '#ff7585' }}>
                          <span className="pulse-dot"/> {it.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 px-2 py-2 rounded-[12px]" style={{ background: 'var(--surface)' }}>
            <Avatar initials="AD" tone="violet" size={34}/>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate">Admin</div>
                <div className="text-[11px] text-[color:var(--text-3)] truncate">admin@201bet.com</div>
              </div>
            )}
            {!isCollapsed && <Link href="/login" className="btn-icon focusable"><I.Logout size={15}/></Link>}
          </div>
        </div>
      </aside>
    </>
  );
};
