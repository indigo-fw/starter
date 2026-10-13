import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  /** Auto-dismiss delay in ms; `0` keeps the toast until the user closes it. */
  timeout: number;
  /** Inline action button (e.g. "Undo"); dismisses the toast when clicked. */
  action?: ToastAction;
}

export interface ToastOptions {
  /**
   * Stable id — re-toasting the same id replaces the visible toast in place
   * (and restarts its timer) instead of stacking duplicates, so progress-style
   * updates ("Uploading 1/3…", "2/3…") and repeated errors stay one row.
   */
  id?: string;
  /** Override the per-type default; `0` = persistent. */
  timeout?: number;
  action?: ToastAction;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (
    message: string,
    type?: ToastType,
    options?: ToastOptions
  ) => string;
  removeToast: (id: string) => void;
}

const DEFAULT_TIMEOUT = 4000;
// Errors carry text the user may need to read twice or act on; a 4 s flash is
// the top complaint about toast UX, so they linger longer.
const ERROR_TIMEOUT = 8000;

const defaultTimeoutFor = (type: ToastType): number =>
  type === 'error' ? ERROR_TIMEOUT : DEFAULT_TIMEOUT;

// Per-toast timer handles live outside the store so an update or a manual
// dismiss can cancel the pending removal — otherwise a stale timer from the
// first toast would yank the replacement off screen early.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimer(id: string) {
  const handle = timers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(id);
  }
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  addToast: (message, type = 'success', options = {}) => {
    const id = options.id ?? crypto.randomUUID();
    const timeout = options.timeout ?? defaultTimeoutFor(type);
    const next: Toast = { id, message, type, timeout, action: options.action };

    clearTimer(id);
    set((state) => {
      const exists = state.toasts.some((t) => t.id === id);
      return {
        toasts: exists
          ? state.toasts.map((t) => (t.id === id ? next : t))
          : [...state.toasts, next],
      };
    });

    if (timeout > 0) {
      timers.set(
        id,
        setTimeout(() => get().removeToast(id), timeout)
      );
    }
    return id;
  },
  removeToast: (id) => {
    clearTimer(id);
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

/** Convenience helper — `toast.success('Saved')`, `toast.error(msg, { timeout: 0 })`. */
export const toast = {
  success: (msg: string, options?: ToastOptions) =>
    useToastStore.getState().addToast(msg, 'success', options),
  error: (msg: string, options?: ToastOptions) =>
    useToastStore.getState().addToast(msg, 'error', options),
  info: (msg: string, options?: ToastOptions) =>
    useToastStore.getState().addToast(msg, 'info', options),
  dismiss: (id: string) => useToastStore.getState().removeToast(id),
};
