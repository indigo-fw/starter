'use client';

import type { ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useAdminTranslations } from '@/core/lib/translations';
import { useOverlay } from '@/core/hooks/useOverlay';

const widthClasses = {
  sm: 'max-w-[384px]',
  md: 'max-w-[512px]',
  lg: 'max-w-[640px]',
  xl: 'max-w-[768px]',
} as const;

export type SlideOverWidth = keyof typeof widthClasses;

/* ── Visual class names (overridable per variant) ── */

export interface SlideOverClassNames {
  panel?: string;
  header?: string;
  body?: string;
}

const ADMIN_CLASSES: Required<SlideOverClassNames> = {
  panel: 'slide-over-panel',
  header: 'slide-over-header',
  body: 'slide-over-body',
};

export interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: SlideOverWidth;
  /** Additional CSS classes on the panel */
  className?: string;
  /** Override visual class names for non-admin contexts (e.g. frontend) */
  classNames?: SlideOverClassNames;
  /** Close when clicking the backdrop (default: true) */
  closeOnBackdropClick?: boolean;
  /** Close on Escape key (default: true) */
  closeOnEscape?: boolean;
  /** Auto-focus first focusable element when opened (default: true) */
  autoFocus?: boolean;
  /** Specific element to receive initial focus */
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

export function SlideOver({
  open,
  onClose,
  title,
  width = 'md',
  className,
  classNames,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  autoFocus = true,
  initialFocusRef,
  children,
}: SlideOverProps) {
  const __ = useAdminTranslations();
  const { panelRef, animateOpen } = useOverlay({ open, onClose, closeOnEscape, autoFocus, initialFocusRef });

  const resolved = classNames
    ? { ...ADMIN_CLASSES, ...classNames }
    : ADMIN_CLASSES;

  const slideOver = (
    <div
      className={cn('overlay-slide-over', animateOpen && 'overlay-slide-over-open')}
      role="dialog"
      aria-modal={open || undefined}
      inert={!open || undefined}
    >
      <div
        className="overlay-backdrop"
        onClick={closeOnBackdropClick ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={cn(
          'overlay-slide-over-panel',
          resolved.panel,
          widthClasses[width],
          className,
        )}
      >
        {/* Header */}
        <div className={cn('overlay-slide-over-header', resolved.header)}>
          <h2 className="overlay-title">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="overlay-close-btn"
            title={__('Close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className={cn('overlay-slide-over-body', resolved.body)}>
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(slideOver, document.body);
  }
  return slideOver;
}
