'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { I, type IconName } from '../ui/icons';
import { Avatar } from '../ui/primitives';
import { NAV } from '@/lib/data';

type Props = { collapsed: boolean; setCollapsed: (v: boolean) => void; openCmdK: () => void };

export const Sidebar: React.FC<Props> = ({ collapsed, setCollapsed, openCmdK }) => {
  const pathname = usePathname();
  const groups: Record<string, typeof NAV> = {};
  NAV.forEach((it) => { (groups[it.group] ||= []).push(it); });

  return (
    <aside className="flex flex-col shrink-0 transition-all duration-300"
      style={{ width: collapsed ? 76 : 248, background: 'var(--bg-2)', borderRight: '1px solid var(--border)' }}>
      <div className="h-[68px] flex items-center px-4 gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="w-9 h-9 rounded-[12px] grid place-items-center shrink-0"
          style={{ background: 'linear-gradient(135deg, #ffc55a, #ff7a1a)', boxShadow: '0 8px 22px -10px rgba(255,138,42,0.6)' }}>
          <I.Flame size={18} stroke={2} style={{ color: '#1a1106' }}/>
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="font-display text-[15px] font-bold leading-tight">201<span className="accent-text">bet</span></div>
            <div className="text-[10.5px] tracking-[0.14em] uppercase text-[color:var(--text-3)] font-semibold">Admin Console</div>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} className="btn-icon focusable" title={collapsed ? 'Expandir' : 'Recolher'}>
          {collapsed ? <I.ChevronRight size={16}/> : <I.ChevronLeft size={16}/>}
        </button>
      </div>

      <div className="px-3 pt-3">
        <button onClick={openCmdK}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-[12px] text-left text-[13px]"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-3)' }}>
          <I.Search size={15}/>
          {!collapsed && <span className="flex-1">Buscar…</span>}
          {!collapsed && <span className="flex items-center gap-1"><kbd>⌘</kbd><kbd>K</kbd></span>}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 no-scrollbar">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            {!collapsed && <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[color:var(--text-4)] px-3 mb-2">{group}</div>}
            <div className="space-y-1">
              {items.map((it) => {
                const Ico = (I[it.icon as IconName] as React.FC<{ size?: number }>) || I.Dashboard;
                const isActive = pathname === it.href || (it.href !== '/dashboard' && pathname.startsWith(it.href));
                return (
                  <Link key={it.id} href={it.href}
                    className={`nav-item w-full focusable ${isActive ? 'active' : ''}`}
                    title={collapsed ? it.label : undefined}>
                    <Ico size={17}/>
                    {!collapsed && <span className="flex-1 text-left">{it.label}</span>}
                    {!collapsed && it.badge && (
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
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold truncate">Admin</div>
              <div className="text-[11px] text-[color:var(--text-3)] truncate">admin@201bet.com</div>
            </div>
          )}
          {!collapsed && <Link href="/login" className="btn-icon focusable"><I.Logout size={15}/></Link>}
        </div>
      </div>
    </aside>
  );
};
