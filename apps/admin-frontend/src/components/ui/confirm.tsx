'use client';

import * as React from 'react';
import { I, type IconName } from './icons';

export type ConfirmTone = 'danger' | 'warning' | 'info' | 'success';

export type ConfirmOptions = {
  title: string;
  body?: React.ReactNode;
  tone?: ConfirmTone;
  icon?: IconName;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type PromptOptions = ConfirmOptions & {
  initialValue?: string;
  placeholder?: string;
  inputLabel?: string;
  /** Quando definida, retorna null se a função retornar string (mensagem de erro). */
  validate?: (value: string) => string | null;
};

type ConfirmState =
  | (ConfirmOptions & { kind: 'confirm'; resolve: (ok: boolean) => void })
  | (PromptOptions & { kind: 'prompt'; resolve: (value: string | null) => void });

type ConfirmCtxValue = (options: ConfirmOptions) => Promise<boolean>;
type PromptCtxValue = (options: PromptOptions) => Promise<string | null>;

const ConfirmCtx = React.createContext<ConfirmCtxValue>(async () => false);
const PromptCtx = React.createContext<PromptCtxValue>(async () => null);

export function useConfirm() {
  return React.useContext(ConfirmCtx);
}

export function usePrompt() {
  return React.useContext(PromptCtx);
}

const TONE_STYLES: Record<ConfirmTone, { bg: string; fg: string; btnBg: string; btnFg: string; icon: IconName }> = {
  danger: { bg: 'var(--rose-soft)', fg: 'var(--rose)', btnBg: 'var(--rose)', btnFg: '#fff', icon: 'AlertTriangle' },
  warning: { bg: 'var(--accent-soft)', fg: 'var(--accent)', btnBg: 'var(--accent)', btnFg: '#1a0e00', icon: 'AlertTriangle' },
  info: { bg: 'var(--accent-soft)', fg: 'var(--accent)', btnBg: 'var(--accent)', btnFg: '#1a0e00', icon: 'Shield' },
  success: { bg: 'var(--emerald-soft)', fg: 'var(--emerald)', btnBg: 'var(--emerald)', btnFg: '#06250f', icon: 'Check' },
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = React.useState<ConfirmState | null>(null);
  const [inputValue, setInputValue] = React.useState('');
  const [inputError, setInputError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const confirm: ConfirmCtxValue = React.useCallback(
    (options) =>
      new Promise<boolean>((resolve) => {
        setState({ ...options, kind: 'confirm', resolve });
      }),
    [],
  );

  const prompt: PromptCtxValue = React.useCallback(
    (options) =>
      new Promise<string | null>((resolve) => {
        setInputValue(options.initialValue ?? '');
        setInputError(null);
        setState({ ...options, kind: 'prompt', resolve });
      }),
    [],
  );

  const closeConfirm = React.useCallback((ok: boolean) => {
    setState((prev) => {
      if (prev?.kind === 'confirm') prev.resolve(ok);
      else if (prev?.kind === 'prompt') prev.resolve(null);
      return null;
    });
  }, []);

  const submitPrompt = React.useCallback(() => {
    setState((prev) => {
      if (prev?.kind !== 'prompt') return prev;
      const trimmed = inputValue.trim();
      if (prev.validate) {
        const err = prev.validate(trimmed);
        if (err) {
          setInputError(err);
          return prev;
        }
      }
      prev.resolve(trimmed);
      return null;
    });
  }, [inputValue]);

  React.useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeConfirm(false);
      else if (e.key === 'Enter') {
        if (state.kind === 'prompt') submitPrompt();
        else closeConfirm(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [state, closeConfirm, submitPrompt]);

  React.useEffect(() => {
    if (state?.kind === 'prompt') {
      const t = setTimeout(() => inputRef.current?.select(), 50);
      return () => clearTimeout(t);
    }
  }, [state]);

  const tone = state?.tone ?? 'danger';
  const styles = TONE_STYLES[tone];
  const IconCmp = state ? (I[state.icon ?? styles.icon] as React.FC<{ size?: number }> | undefined) : undefined;

  return (
    <ConfirmCtx.Provider value={confirm}>
      <PromptCtx.Provider value={prompt}>
        {children}
        {state && (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center cmdk-overlay p-4"
            onMouseDown={(e) => { if (e.target === e.currentTarget) closeConfirm(false); }}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="surface-elev p-6 w-full max-w-md"
              style={{ borderRadius: 18 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-[12px] grid place-items-center shrink-0"
                  style={{ background: styles.bg, color: styles.fg }}
                >
                  {IconCmp ? <IconCmp size={18}/> : <I.AlertTriangle size={18}/>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display text-[18px] font-bold leading-tight">{state.title}</div>
                  {state.body && (
                    <div className="text-[12.5px] text-[color:var(--text-2)] leading-relaxed mt-1.5">
                      {state.body}
                    </div>
                  )}
                </div>
              </div>

              {state.kind === 'prompt' && (
                <div className="mt-2">
                  {state.inputLabel && (
                    <label className="text-[10.5px] font-semibold tracking-[0.14em] uppercase text-[color:var(--text-3)]">
                      {state.inputLabel}
                    </label>
                  )}
                  <input
                    ref={inputRef}
                    autoFocus
                    type="text"
                    className="input mt-1"
                    value={inputValue}
                    onChange={(e) => { setInputValue(e.target.value); if (inputError) setInputError(null); }}
                    placeholder={state.placeholder}
                  />
                  {inputError && (
                    <div className="text-[11.5px] mt-1.5" style={{ color: 'var(--rose)' }}>{inputError}</div>
                  )}
                </div>
              )}

              <div className="flex gap-2 mt-5 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  type="button"
                  className="btn btn-ghost flex-1 justify-center focusable"
                  onClick={() => closeConfirm(false)}
                >
                  {state.cancelLabel ?? 'Cancelar'}
                </button>
                <button
                  type="button"
                  autoFocus={state.kind === 'confirm'}
                  className="btn flex-1 justify-center focusable"
                  style={{ background: styles.btnBg, color: styles.btnFg }}
                  onClick={() => state.kind === 'prompt' ? submitPrompt() : closeConfirm(true)}
                >
                  {IconCmp ? <IconCmp size={14}/> : null} {state.confirmLabel ?? (state.kind === 'prompt' ? 'Salvar' : 'Confirmar')}
                </button>
              </div>
            </div>
          </div>
        )}
      </PromptCtx.Provider>
    </ConfirmCtx.Provider>
  );
};
