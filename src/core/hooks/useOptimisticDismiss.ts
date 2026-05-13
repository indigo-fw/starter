'use client';

import { create } from 'zustand';

/**
 * Optimistic "dismiss" for list items — mark-as-read, archive, hide, etc.
 *
 * The pattern: when the user acts on a row, you want it gone *now*, not after
 * the server round-trip + revalidate. This keeps a process-local set of
 * dismissed ids; you fire the real mutation in a transition and, in the
 * meantime, hide the row.
 *
 * Recommended wiring (server-rendered list + CSS transition):
 *
 *   // server: render each row with a stable id attr
 *   <li data-dismiss-id={item.id}> … <DismissButton id={item.id} /> … </li>
 *
 *   // client: a small effect that toggles a data attr the CSS animates
 *   const dismissed = useDismissed();
 *   useEffect(() => {
 *     for (const id of dismissed) {
 *       containerRef.current?.querySelector(`[data-dismiss-id="${id}"]`)
 *         ?.setAttribute('data-dismissed', 'true');
 *     }
 *   }, [dismissed]);
 *
 *   // css
 *   [data-dismissed='true'] {
 *     opacity: 0; max-height: 0; margin: 0; overflow: hidden;
 *     transition: opacity .25s, max-height .35s ease .1s, margin .35s ease .1s;
 *     pointer-events: none;
 *   }
 *
 *   // button
 *   function DismissButton({ id }: { id: string }) {
 *     const dismiss = useDismiss();
 *     const [, start] = useTransition();
 *     return <button onClick={() => { dismiss(id); start(() => markRead(id)); }}>Done</button>;
 *   }
 *
 * `reconcile(ids)` is the important bit: after the server re-renders a fresh
 * list, call it with the current ids so stale dismissed-ids get pruned —
 * otherwise a new item that happens to reuse an old id would be hidden
 * forever. Call it from an effect keyed on a stable string of the ids.
 */

interface DismissStore {
  dismissed: Set<string>;
  dismiss: (id: string) => void;
  undismiss: (id: string) => void;
  /** Drop ids no longer present in the current list. Returns same ref if unchanged. */
  reconcile: (presentIds: string[]) => void;
}

export const useDismissStore = create<DismissStore>((set) => ({
  dismissed: new Set<string>(),
  dismiss: (id) => set((s) => {
    if (s.dismissed.has(id)) return s;
    const next = new Set(s.dismissed);
    next.add(id);
    return { dismissed: next };
  }),
  undismiss: (id) => set((s) => {
    if (!s.dismissed.has(id)) return s;
    const next = new Set(s.dismissed);
    next.delete(id);
    return { dismissed: next };
  }),
  reconcile: (presentIds) => set((s) => {
    if (s.dismissed.size === 0) return s;
    const present = new Set(presentIds);
    let changed = false;
    const next = new Set<string>();
    for (const id of s.dismissed) {
      if (present.has(id)) next.add(id);
      else changed = true;
    }
    return changed ? { dismissed: next } : s;
  }),
}));

/** Selector hooks for ergonomics. */
export const useDismissed = () => useDismissStore((s) => s.dismissed);
export const useDismiss = () => useDismissStore((s) => s.dismiss);
export const useReconcileDismissed = () => useDismissStore((s) => s.reconcile);
