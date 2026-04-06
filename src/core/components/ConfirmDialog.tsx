'use client';

import { Dialog } from '@/core/components/Dialog';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
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
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Dialog open={open} onClose={onCancel} size="sm">
      <Dialog.Body>
        <h3 className="text-lg font-semibold text-(--text-primary)">{title}</h3>
        <p className="mt-2 text-sm text-(--text-secondary)">{message}</p>
      </Dialog.Body>
      <Dialog.Footer>
        <button
          onClick={onCancel}
          className="btn btn-secondary"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          className={
            variant === 'danger'
              ? 'btn btn-danger'
              : 'btn btn-primary'
          }
        >
          {confirmLabel}
        </button>
      </Dialog.Footer>
    </Dialog>
  );
}
