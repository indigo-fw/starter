import { useEffect, useRef } from 'react';

export interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  /**
   * Fire even while the user is typing in an input/textarea/select/contentEditable.
   * Modified shortcuts (`ctrl: true`) always fire there — Ctrl+S must save from
   * inside a textarea; this flag is for bare keys like `/` or `?`.
   */
  allowInInputs?: boolean;
  handler: () => void;
}

export interface KeyboardShortcutsOptions {
  /** `false` suspends every binding (e.g. while a modal owns the keyboard). */
  enabled?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/**
 * Document-level keydown bindings. The list is read through a ref, so callers
 * can pass a fresh array every render without re-subscribing (no `useMemo`
 * needed). Bare-key shortcuts are skipped while typing in a form control
 * unless the binding sets `allowInInputs`.
 */
export function useKeyboardShortcuts(
  shortcuts: Shortcut[],
  options: KeyboardShortcutsOptions = {}
) {
  const enabled = options.enabled ?? true;
  const shortcutsRef = useRef(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  });

  useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(e: KeyboardEvent) {
      const editable = isEditableTarget(e.target);
      for (const s of shortcutsRef.current) {
        const ctrlMatch = s.ctrl
          ? e.ctrlKey || e.metaKey
          : !e.ctrlKey && !e.metaKey;
        const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey;
        if (
          e.key.toLowerCase() !== s.key.toLowerCase() ||
          !ctrlMatch ||
          !shiftMatch
        )
          continue;
        if (editable && !s.ctrl && !s.allowInInputs) continue;
        e.preventDefault();
        s.handler();
        return;
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
