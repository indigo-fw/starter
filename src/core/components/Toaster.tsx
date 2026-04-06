'use client';

import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

import { useToastStore } from '@/core/store/toast-store';
import { cn } from '@/lib/utils';

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const styles = {
  success: 'bg-green-50 dark:bg-green-500/15 text-green-800 dark:text-green-300 border-green-200 dark:border-green-500/30',
  error: 'bg-red-50 dark:bg-red-500/15 text-red-800 dark:text-red-300 border-red-200 dark:border-red-500/30',
  info: 'bg-brand-50 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.12)] text-brand-800 dark:text-brand-300 border-brand-200 dark:border-[oklch(0.65_0.17_var(--brand-hue)_/_0.30)]',
};

export function Toaster() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="ui-toast-container fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = icons[t.type];
        return (
          <div
            key={t.id}
            className={cn(
              'ui-toast flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-md',
              styles[t.type]
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-2 shrink-0 opacity-60 hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
