import { type RefObject, useEffect, useRef } from 'react';

export interface CloseOnClickOutsideOptions {
  /**
   * Elements that count as "inside" even though they're outside `ref` — pass
   * the trigger button when it lives outside the panel, otherwise its own
   * click both closes (here) and re-opens (its onClick) in one tap.
   */
  excludeRefs?: RefObject<HTMLElement | null>[];
  /** Usually the `open` flag: no listener while closed. Defaults to true. */
  enabled?: boolean;
}

/**
 * Calls `onClose` on a `mousedown` outside `ref` (and outside `excludeRefs`).
 * `onClose` is read through a ref, so an inline arrow is fine — the listener
 * is only (re)attached when `enabled` flips.
 */
export function useCloseOnClickOutside(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  { excludeRefs, enabled = true }: CloseOnClickOutsideOptions = {}
): void {
  const onCloseRef = useRef(onClose);
  const excludeRef = useRef(excludeRefs);
  useEffect(() => {
    onCloseRef.current = onClose;
    excludeRef.current = excludeRefs;
  });

  useEffect(() => {
    if (!enabled) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (!ref.current || ref.current.contains(target)) return;
      if (excludeRef.current?.some((r) => r.current?.contains(target))) return;
      onCloseRef.current();
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [ref, enabled]);
}
