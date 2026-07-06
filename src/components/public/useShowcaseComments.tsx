'use client';

import { useState, type ReactNode } from 'react';

import { trpc } from '@/lib/trpc/client';
import { CommentPanel } from './CommentPanel';

/**
 * Comments layer for the showcase feed — contributed by core-comments via the
 * 'showcase-comments' content slot (see `module.config.ts`). ShowcaseFeed
 * imports it from `@/generated/content-slots`, which swaps in an inert
 * fallback when the module is removed.
 */
export function useShowcaseComments(itemIds: string[]): {
  counts: Record<string, number>;
  openPanel: (id: string) => void;
  isPanelOpen: boolean;
  panel: ReactNode;
} {
  const [panelId, setPanelId] = useState<string | null>(null);

  const { data } = trpc.comments.countMany.useQuery(
    { targetType: 'showcase', targetIds: itemIds },
    { enabled: itemIds.length > 0 },
  );

  return {
    counts: data ?? {},
    openPanel: setPanelId,
    isPanelOpen: panelId !== null,
    panel: (
      <CommentPanel
        targetType="showcase"
        targetId={panelId}
        onClose={() => setPanelId(null)}
      />
    ),
  };
}
