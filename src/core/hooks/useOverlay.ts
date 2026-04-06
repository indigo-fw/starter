'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { getClickOrigin } from '@/core/lib/click-origin';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])';

/** Stack counter for nested overlays — only restores scroll when all overlays close */
let overlayStack = 0;

export interface UseOverlayOptions {
  /** Whether the overlay is currently open */
  open: boolean;
  /** Called when the overlay requests close (Escape key) */
  onClose: () => void;
  /** Close on Escape key press (default: true) */
  closeOnEscape?: boolean;
  /** Auto-focus when opened (default: true) */
  autoFocus?: boolean;
  /** Specific element to receive initial focus (overrides first-focusable default) */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export interface UseOverlayReturn<T extends HTMLElement> {
  /** Attach to the panel/content container — defines the focus trap boundary */
  panelRef: RefObject<T | null>;
  /** Deferred open state for CSS transition classes (true 1 frame after `open`) */
  animateOpen: boolean;
  /** CSS transform-origin value based on last click position */
  transformOrigin: string | undefined;
}

/**
 * Shared overlay behavior for Dialog, SlideOver, and similar components.
 *
 * Handles:
 * - Focus trap (Tab/Shift+Tab cycling within panel)
 * - Stack-safe scroll lock with scrollbar width compensation
 * - Escape key to close
 * - Auto-focus (first focusable or specific element via initialFocusRef)
 * - Focus restoration on close
 * - Animation deferral (1-frame delay for mount-to-open CSS transitions)
 */
export function useOverlay<T extends HTMLElement = HTMLDivElement>({
  open,
  onClose,
  closeOnEscape = true,
  autoFocus = true,
  initialFocusRef,
}: UseOverlayOptions): UseOverlayReturn<T> {
  const panelRef = useRef<T | null>(null);
  const [animateOpen, setAnimateOpen] = useState(false);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const originRef = useRef<string | undefined>(undefined);

  // Keep onClose ref current — avoids effect re-runs on inline callbacks
  onCloseRef.current = onClose;

  // Capture click origin when dialog opens (before animation starts)
  useEffect(() => {
    if (open) {
      originRef.current = getClickOrigin();
    }
  }, [open]);

  // Defer CSS open class by 1 frame so mount-to-open transitions animate correctly
  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => setAnimateOpen(true));
      return () => cancelAnimationFrame(raf);
    }
    setAnimateOpen(false);
  }, [open]);

  // Core behavior: focus trap, scroll lock, keyboard, auto-focus
  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;

    // Save previously focused element for restoration on close
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Stack-safe scroll lock — only lock/unlock at stack boundaries
    if (overlayStack === 0) {
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      document.body.style.overflow = 'hidden';
    }
    overlayStack++;

    // Keyboard: Escape + focus trap
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && panel) {
        const focusable =
          panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);

    // Auto-focus after 1 frame (DOM is ready, transition has started)
    let focusRaf: number | undefined;
    if (autoFocus) {
      focusRaf = requestAnimationFrame(() => {
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus();
        } else {
          const focusable =
            panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
          focusable?.[0]?.focus();
        }
      });
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (focusRaf !== undefined) cancelAnimationFrame(focusRaf);

      // Stack-safe scroll unlock
      overlayStack--;
      if (overlayStack === 0) {
        document.body.style.paddingRight = '';
        document.body.style.overflow = '';
      }

      // Restore focus to previously active element
      previousFocusRef.current?.focus();
    };
  }, [open, closeOnEscape, autoFocus, initialFocusRef]);

  return { panelRef, animateOpen, transformOrigin: originRef.current };
}
