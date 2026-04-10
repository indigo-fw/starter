'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useOverlay } from '@/core/hooks/useOverlay';

export interface LightboxProps {
  /** Controls visibility */
  open: boolean;
  /** Called when the lightbox requests close (Escape, backdrop click) */
  onClose: () => void;
  /** Accessible label describing the content (e.g. "Photo of sunset") */
  label?: string;
  /** Close when clicking the content area itself (e.g. for single images) */
  closeOnContentClick?: boolean;
  /** Extra buttons rendered next to the close button */
  headerButtons?: ReactNode;
  /** Additional CSS classes on the content wrapper */
  className?: string;
  children: ReactNode;
}

export function Lightbox({
  open,
  onClose,
  label = 'Media viewer',
  closeOnContentClick = false,
  headerButtons,
  className,
  children,
}: LightboxProps) {
  const { panelRef, animateOpen, transformOrigin } = useOverlay({
    open,
    onClose,
    closeOnEscape: true,
    autoFocus: true,
  });

  return (
    <div
      className={cn('overlay-lightbox', animateOpen && 'overlay-lightbox-open')}
      role="dialog"
      aria-modal={open || undefined}
      aria-label={label}
      inert={!open || undefined}
    >
      <div
        className="overlay-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className={cn(
          'overlay-lightbox-content',
          closeOnContentClick && 'cursor-pointer',
          className,
        )}
        style={transformOrigin ? { transformOrigin } : undefined}
        onClick={closeOnContentClick ? onClose : undefined}
      >
        {children}
        <div className="overlay-lightbox-actions">
          {headerButtons}
          <button
            type="button"
            className="overlay-lightbox-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
