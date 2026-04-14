'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Dialog } from '@/core/components/overlays/Dialog';
import { useBlankTranslations } from '@/core/lib/i18n/translations';

/* ── Types ── */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
}

export interface AlertOptions {
  title: string;
  message?: string;
  okLabel?: string;
}

export interface PromptOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type DialogState =
  | { type: 'confirm'; options: ConfirmOptions }
  | { type: 'alert'; options: AlertOptions }
  | { type: 'prompt'; options: PromptOptions };

interface QueueEntry {
  state: DialogState;
  resolve: (value: unknown) => void;
}

interface ImperativeDialogContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

const ImperativeDialogContext = createContext<ImperativeDialogContextValue | null>(null);

/* ── Provider ── */

export function ImperativeDialogProvider({ children }: { children: ReactNode }) {
  const __ = useBlankTranslations();
  const [state, setState] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState('');

  // Refs for stable callbacks — no dep on state/inputValue
  const stateRef = useRef(state);
  stateRef.current = state;
  const inputRef = useRef(inputValue);
  inputRef.current = inputValue;
  const resolveRef = useRef<((value: unknown) => void) | null>(null);
  const activeRef = useRef(false);
  const queueRef = useRef<QueueEntry[]>([]);

  const open = state !== null;

  const show = useCallback((entry: QueueEntry) => {
    activeRef.current = true;
    resolveRef.current = entry.resolve;
    if (entry.state.type === 'prompt') {
      setInputValue(entry.state.options.defaultValue ?? '');
    }
    setState(entry.state);
  }, []);

  const showNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (next) {
      show(next);
    } else {
      activeRef.current = false;
      setState(null);
      setInputValue('');
      resolveRef.current = null;
    }
  }, [show]);

  // Stable — reads from refs, no deps on state
  const enqueue = useCallback((dialogState: DialogState): Promise<unknown> => {
    return new Promise((resolve) => {
      const entry = { state: dialogState, resolve };
      if (!activeRef.current) {
        show(entry);
      } else {
        queueRef.current.push(entry);
      }
    });
  }, [show]);

  const confirm = useCallback(
    (options: ConfirmOptions) => enqueue({ type: 'confirm', options }) as Promise<boolean>,
    [enqueue],
  );

  const alert = useCallback(
    (options: AlertOptions) => enqueue({ type: 'alert', options }) as Promise<void>,
    [enqueue],
  );

  const prompt = useCallback(
    (options: PromptOptions) => enqueue({ type: 'prompt', options }) as Promise<string | null>,
    [enqueue],
  );

  // Stable — reads from refs. Guard against double-click via resolve-once pattern.
  const handleCancel = useCallback(() => {
    const resolve = resolveRef.current;
    if (!resolve) return;
    resolveRef.current = null;
    const s = stateRef.current;
    if (s?.type === 'confirm') resolve(false);
    else if (s?.type === 'alert') resolve(undefined);
    else if (s?.type === 'prompt') resolve(null);
    showNext();
  }, [showNext]);

  const handleConfirm = useCallback(() => {
    const resolve = resolveRef.current;
    if (!resolve) return;
    resolveRef.current = null;
    const s = stateRef.current;
    if (s?.type === 'confirm') resolve(true);
    else if (s?.type === 'alert') resolve(undefined);
    else if (s?.type === 'prompt') resolve(inputRef.current);
    showNext();
  }, [showNext]);

  // Stable context value — callbacks never change
  const contextValue = useMemo(
    () => ({ confirm, alert, prompt }),
    [confirm, alert, prompt],
  );

  return (
    <ImperativeDialogContext.Provider value={contextValue}>
      {children}
      <Dialog
        open={open}
        onClose={handleCancel}
        size="sm"
        closeOnBackdropClick={state?.type !== 'prompt'}
      >
        {state && (
          <>
            <Dialog.Body>
              <h3 className="text-lg font-semibold text-(--text-primary)">
                {state.options.title}
              </h3>
              {'message' in state.options && state.options.message && (
                <p className="mt-2 text-sm text-(--text-secondary)">
                  {state.options.message}
                </p>
              )}
              {state.type === 'prompt' && (
                <input
                  type="text"
                  className="input mt-3 w-full"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={state.options.placeholder}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirm();
                  }}
                  autoFocus
                />
              )}
            </Dialog.Body>
            <Dialog.Footer>
              {state.type === 'alert' ? (
                <button onClick={handleConfirm} className="btn btn-primary">
                  {state.options.okLabel ?? __('OK')}
                </button>
              ) : (
                <>
                  <button onClick={handleCancel} className="btn btn-secondary">
                    {state.options.cancelLabel ?? __('Cancel')}
                  </button>
                  <button
                    onClick={handleConfirm}
                    className={
                      state.type === 'confirm' && state.options.variant === 'danger'
                        ? 'btn btn-danger'
                        : 'btn btn-primary'
                    }
                  >
                    {state.options.confirmLabel ?? __('Confirm')}
                  </button>
                </>
              )}
            </Dialog.Footer>
          </>
        )}
      </Dialog>
    </ImperativeDialogContext.Provider>
  );
}

/* ── Hooks ── */

function useImperativeDialog() {
  const ctx = useContext(ImperativeDialogContext);
  if (!ctx) {
    throw new Error('useConfirm/useAlert/usePrompt must be used within <ImperativeDialogProvider>');
  }
  return ctx;
}

export function useConfirm() {
  return useImperativeDialog().confirm;
}

export function useAlert() {
  return useImperativeDialog().alert;
}

export function usePrompt() {
  return useImperativeDialog().prompt;
}
