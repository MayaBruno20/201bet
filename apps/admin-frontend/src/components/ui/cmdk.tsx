'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { I, type IconName } from './icons';
import { NAV } from '@/lib/data';
import { useToast } from './toast';

type Item =
  | { kind: 'nav'; id: string; label: string; hint: string; icon: string; href: string }
  | { kind: 'action'; id: string; label: string; hint: string; icon: string; run: () => void };

type Props = { open: boolean; setOpen: (v: boolean) => void };

export const CmdK: React.FC<Props> = ({ open, setOpen }) => {
  const router = useRouter();
  const { push } = useToast();
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQ(''); setSel(0); }
  }, [open]);

  const items = React.useMemo<Item[]>(() => {
    const navItems: Item[] = NAV.map((n) => ({ kind: 'nav', id: n.id, label: n.label, hint: n.group, icon: n.icon, href: n.href }));
    const actions: Item[] = [
      { kind: 'action', id: 'new-event', label: 'Criar novo evento', hint: 'Atalho', icon: 'Plus', run: () => { router.push('/eventos'); push({ title: 'Vamos lá', body: 'Abra o painel para criar.', tone: 'amber' }); } },
      { kind: 'action', id: 'new-pilot', label: 'Cadastrar piloto', hint: 'Atalho', icon: 'Users', run: () => router.push('/pilotos') },
      { kind: 'action', id: 'approve-saques', label: 'Ver saques pendentes', hint: 'Atalho', icon: 'Wallet', run: () => router.push('/apostas') },
      { kind: 'action', id: 'audit', label: 'Abrir auditoria', hint: 'Atalho', icon: 'Shield', run: () => router.push('/auditoria') },
    ];
    const all = [...navItems, ...actions];
    if (!q) return all;
    return all.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()) || i.hint.toLowerCase().includes(q.toLowerCase()));
  }, [q, router, push]);

  const run = React.useCallback((it: Item) => {
    if (it.kind === 'nav') router.push(it.href);
    else it.run();
    setOpen(false);
  }, [router, setOpen]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      if (e.key === 'Enter') { e.preventDefault(); items[sel] && run(items[sel]); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, sel, run, setOpen]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 cmdk-overlay z-50 grid place-items-start pt-24" onClick={() => setOpen(false)}>
      <div className="surface-elev w-[560px] max-w-[90vw] mx-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <I.Search size={16}/>
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
            placeholder="Buscar telas, ações, pilotos, eventos…"
            className="flex-1 bg-transparent outline-none text-[14px] text-[color:var(--text)]"/>
          <kbd>esc</kbd>
        </div>
        <div className="max-h-[360px] overflow-auto p-2">
          {items.length === 0 && <div className="px-4 py-10 text-center text-sm text-[color:var(--text-3)]">Nenhum resultado.</div>}
          {items.map((it, i) => {
            const Ico = (I[it.icon as IconName] as React.FC<{ size?: number }>) || I.Dashboard;
            return (
              <div key={it.kind+it.id} className={`cmdk-item ${i === sel ? 'selected' : ''}`}
                onMouseEnter={() => setSel(i)} onClick={() => run(it)}>
                <div className="w-8 h-8 grid place-items-center rounded-[10px]" style={{ background: 'var(--surface-2)' }}>
                  <Ico size={15}/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{it.label}</div>
                  <div className="text-[11px] text-[color:var(--text-3)]">{it.kind === 'nav' ? `Ir para · ${it.hint}` : it.hint}</div>
                </div>
                <kbd>↵</kbd>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 px-4 py-2 text-[11px] text-[color:var(--text-3)]" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="flex items-center gap-1"><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span className="flex items-center gap-1"><kbd>↵</kbd> abrir</span>
          <span className="flex items-center gap-1"><kbd>esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  );
};
