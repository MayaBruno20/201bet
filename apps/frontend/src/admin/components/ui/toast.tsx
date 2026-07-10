'use client';

import * as React from 'react';
import { I } from './icons';

export type Toast = { id: string; title: string; body?: string; tone?: string; timeout?: number; action?: { label: string; run?: () => void } };

type Ctx = { push: (t: Omit<Toast, 'id'>) => void };
const ToastCtx = React.createContext<Ctx>({ push: () => {} });

export function useToast() { return React.useContext(ToastCtx); }

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const dismiss = React.useCallback((id: string) => setToasts((c) => c.filter((t) => t.id !== id)), []);
  const push = React.useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((curr) => [...curr, { ...t, id }]);
    setTimeout(() => setToasts((curr) => curr.filter((x) => x.id !== id)), t.timeout || 4000);
  }, []);
  const colorMap: Record<string, string> = { amber: '#ffb028', emerald: '#3ee093', rose: '#ff7585', sky: '#7cd0ff', violet: '#a78bfa' };
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 left-4 right-4 sm:left-auto sm:right-5 z-50 flex flex-col gap-2 sm:w-[340px]">
        {toasts.map((t) => {
          const tone = t.tone || 'amber';
          return (
            <div key={t.id} className="toast flex items-start gap-3">
              <div className="w-8 h-8 rounded-[10px] grid place-items-center shrink-0" style={{ background: 'var(--surface-2)', color: colorMap[tone] }}>
                <I.Sparkles size={15}/>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold">{t.title}</div>
                {t.body && <div className="text-[12px] text-[color:var(--text-2)] mt-0.5">{t.body}</div>}
                {t.action && (
                  <button className="text-[12px] font-semibold mt-2" style={{ color: colorMap[tone] }}
                    onClick={() => { t.action?.run?.(); dismiss(t.id); }}>{t.action.label}</button>
                )}
              </div>
              <button className="btn-icon focusable -mt-1 -mr-1" onClick={() => dismiss(t.id)}><I.X size={14}/></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
};
