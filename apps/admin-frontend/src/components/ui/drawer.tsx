'use client';

import * as React from 'react';
import { I } from './icons';
import { Avatar, StatusChip } from './primitives';

type DrawerProps = { open: boolean; onClose: () => void; title?: string; width?: number; children: React.ReactNode };

export const Drawer: React.FC<DrawerProps> = ({ open, onClose, title, children, width = 480 }) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`}>
      <div className="absolute inset-0 transition-opacity duration-300"
        style={{ background: 'rgba(0,0,0,0.5)', opacity: open ? 1 : 0 }} onClick={onClose}/>
      <div className="absolute right-0 top-0 bottom-0 transition-transform duration-300 flex flex-col"
        style={{ width, maxWidth: '100vw', background: 'var(--bg-2)', borderLeft: '1px solid var(--border)', transform: open ? 'translateX(0)' : 'translateX(100%)' }}>
        <div className="h-[68px] px-5 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="font-display text-[16px] font-semibold">{title}</div>
          <button className="btn-icon focusable" onClick={onClose}><I.X size={17}/></button>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
};

// Drawer context — opens contextual detail panes (e.g. pilot info)
type DrawerPayload = { kind: 'pilot'; data: { id: number; name: string; tag: string; vehicle: string; cat: string; region: string; wins: number; points: number; status: string; avatar: string } } | null;

type DrawerCtx = {
  open: (p: DrawerPayload) => void;
  close: () => void;
};

const Ctx = React.createContext<DrawerCtx | null>(null);

export const useDrawer = (): DrawerCtx => {
  const v = React.useContext(Ctx);
  if (v) return v;
  // Fallback no-op so pages don't crash if provider isn't mounted yet
  return { open: () => {}, close: () => {} };
};

export const DrawerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [payload, setPayload] = React.useState<DrawerPayload>(null);
  const open = React.useCallback((p: DrawerPayload) => setPayload(p), []);
  const close = React.useCallback(() => setPayload(null), []);

  const isOpen = payload !== null;
  const p = payload?.data;

  return (
    <Ctx.Provider value={{ open, close }}>
      {children}
      <Drawer open={isOpen} onClose={close} title={p ? 'Detalhes do piloto' : ''} width={460}>
        {p && (
          <div className="p-5 space-y-5">
            <div className="flex items-center gap-3">
              <Avatar initials={p.avatar} size={56} tone="amber"/>
              <div>
                <div className="font-display text-[18px] font-bold">{p.name}</div>
                <div className="text-[12px] text-[color:var(--text-3)] font-mono">{p.tag}</div>
                <div className="mt-1.5"><StatusChip status={p.status}/></div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="surface-2 p-3"><div className="text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--text-3)] font-semibold">Veículo</div><div className="font-semibold mt-1">{p.vehicle}</div></div>
              <div className="surface-2 p-3"><div className="text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--text-3)] font-semibold">Categoria</div><div className="font-semibold mt-1">{p.cat}</div></div>
              <div className="surface-2 p-3"><div className="text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--text-3)] font-semibold">Região</div><div className="font-semibold mt-1 font-mono">{p.region}</div></div>
              <div className="surface-2 p-3"><div className="text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--text-3)] font-semibold">ID</div><div className="font-semibold mt-1 font-mono">#{p.id}</div></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="surface-2 p-4"><div className="text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--text-3)] font-semibold">Vitórias</div><div className="font-display text-[24px] font-bold mt-1 tabular-nums">{p.wins}</div></div>
              <div className="surface-2 p-4"><div className="text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--text-3)] font-semibold">Pontos</div><div className="font-display text-[24px] font-bold mt-1 tabular-nums">{p.points}</div></div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost flex-1 justify-center"><I.Edit size={14}/> Editar</button>
              <button className="btn btn-primary flex-1 justify-center"><I.Trophy size={14}/> Ver histórico</button>
            </div>
          </div>
        )}
      </Drawer>
    </Ctx.Provider>
  );
};
