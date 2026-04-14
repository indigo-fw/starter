'use client';

import { Dialog } from '@/core/components/overlays/Dialog';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={loading ? () => {} : onCancel}
      size="sm"
      closeOnBackdropClick={!loading}
      closeOnEscape={!loading}
    >
      <Dialog.Body>
        <h3 className="text-lg font-semibold text-(--text-primary)">{title}</h3>
        <p className="mt-2 text-sm text-(--text-secondary)">{message}</p>
      </Dialog.Body>
      <Dialog.Footer>
        <button
          onClick={onCancel}
          disabled={loading}
          className={cn('btn btn-secondary', loading && 'opacity-50 pointer-events-none')}
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={cn(
            variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary',
            loading && 'opacity-50 pointer-events-none'
          )}
        >
          {confirmLabel}
        </button>
      </Dialog.Footer>
    </Dialog>
  );
}
