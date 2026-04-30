'use client';

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

type ConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  highlightText?: string;
};

type ConfirmCtx = (opts: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmCtx | null>(null);

export function useConfirm(): ConfirmCtx {
  const fn = useContext(Ctx);
  if (!fn) throw new Error('useConfirm must be used within ConfirmProvider');
  return fn;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    opts: ConfirmOptions;
    resolve: (v: boolean) => void;
  } | null>(null);

  const confirm = useCallback<ConfirmCtx>((opts) => {
    return new Promise<boolean>((resolve) => {
      setState({ opts, resolve });
    });
  }, []);

  const close = (result: boolean) => {
    if (!state) return;
    state.resolve(result);
    setState(null);
  };

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state && (
        <div className='fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 p-3 sm:p-4 backdrop-blur-sm animate-fadeIn'>
          <div className='w-full max-w-md rounded-2xl border border-white/15 bg-[#101525] p-4 sm:p-6 shadow-2xl animate-slideUp'>
            <div className='flex items-start gap-3 mb-4'>
              <div className={`shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${state.opts.danger ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
                {state.opts.danger ? (
                  <svg className='w-7 h-7 text-red-400' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
                  </svg>
                ) : (
                  <svg className='w-7 h-7 text-amber-400' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' />
                  </svg>
                )}
              </div>
              <div className='flex-1'>
                <h3 className='text-lg font-bold text-white'>{state.opts.title}</h3>
              </div>
            </div>

            <div className='text-sm text-white/80 mb-2 whitespace-pre-line'>{state.opts.message}</div>

            {state.opts.highlightText && (
              <div className='mt-3 mb-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center'>
                <p className='text-base font-bold text-white'>{state.opts.highlightText}</p>
              </div>
            )}

            <div className='mt-5 flex gap-2'>
              <button
                type='button'
                onClick={() => close(false)}
                className='flex-1 rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10'
              >
                {state.opts.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                type='button'
                onClick={() => close(true)}
                className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold ${state.opts.danger
                  ? 'bg-red-500 text-white hover:bg-red-400'
                  : 'bg-emerald-400 text-black hover:bg-emerald-300'
                }`}
              >
                {state.opts.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
          <style jsx>{`
            @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
            @keyframes slideUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
            .animate-fadeIn { animation: fadeIn 0.15s ease-out }
            .animate-slideUp { animation: slideUp 0.2s ease-out }
          `}</style>
        </div>
      )}
    </Ctx.Provider>
  );
}
