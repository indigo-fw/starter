import { useEffect } from 'react';

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  handler: () => void;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      for (const s of shortcuts) {
        const ctrlMatch = s.ctrl ? e.ctrlKey || e.metaKey : !e.ctrlKey && !e.metaKey;
        const shiftMatch = s.shift ? e.shiftKey : !e.shiftKey;
        if (e.key.toLowerCase() === s.key.toLowerCase() && ctrlMatch && shiftMatch) {
          e.preventDefault();
          s.handler();
          return;
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
