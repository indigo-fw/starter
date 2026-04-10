'use client';

import { useCallback, useState } from 'react';

import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { toast } from '@/core/store/toast-store';

interface BulkActionsMutations {
  deleteMutateAsync: (input: { id: string }) => Promise<unknown>;
  restoreMutateAsync: (input: { id: string }) => Promise<unknown>;
  updateMutateAsync: (input: {
    id: string;
    status: number;
  }) => Promise<unknown>;
}

interface UseBulkActionsConfig {
  selectedIds: Set<string>;
  deselectAll: () => void;
  mutations: BulkActionsMutations;
  refetch: () => void;
  invalidateCounts: () => void;
}

function countResults(results: PromiseSettledResult<unknown>[]) {
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  return { succeeded, failed: results.length - succeeded };
}

export function useBulkActions({
  selectedIds,
  deselectAll,
  mutations,
  refetch,
  invalidateCounts,
}: UseBulkActionsConfig) {
  const __ = useAdminTranslations();
  const [isPending, setIsPending] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'trash' | null>(null);

  const finalize = useCallback(() => {
    deselectAll();
    refetch();
    invalidateCounts();
  }, [deselectAll, refetch, invalidateCounts]);

  const showResult = useCallback(
    (succeeded: number, failed: number, action: string) => {
      if (failed > 0) {
        toast.info(__('{succeeded} {action}, {failed} failed', { succeeded, action, failed }));
      } else {
        toast.success(__._n('1 item {action}', '{count} items {action}', succeeded, { action }));
      }
    },
    [__]
  );

  // ── Trash ──────────────────────────────────────────────
  const requestBulkTrash = useCallback(() => {
    if (selectedIds.size === 0) return;
    setConfirmAction('trash');
  }, [selectedIds.size]);

  const executeBulkTrash = useCallback(async () => {
    setIsPending(true);
    setConfirmAction(null);
    try {
      const results = await Promise.allSettled(
        [...selectedIds].map((id) => mutations.deleteMutateAsync({ id }))
      );
      const { succeeded, failed } = countResults(results);
      showResult(succeeded, failed, 'moved to trash');
      finalize();
    } finally {
      setIsPending(false);
    }
  }, [selectedIds, mutations, showResult, finalize]);

  // ── Restore (no confirmation — non-destructive) ───────
  const executeBulkRestore = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsPending(true);
    try {
      const results = await Promise.allSettled(
        [...selectedIds].map((id) => mutations.restoreMutateAsync({ id }))
      );
      const { succeeded, failed } = countResults(results);
      showResult(succeeded, failed, 'restored');
      finalize();
    } finally {
      setIsPending(false);
    }
  }, [selectedIds, mutations, showResult, finalize]);

  const dismissConfirm = useCallback(() => setConfirmAction(null), []);

  // ── Status Change ──────────────────────────────────────
  const executeBulkStatusChange = useCallback(
    async (status: number) => {
      setIsPending(true);
      try {
        const results = await Promise.allSettled(
          [...selectedIds].map((id) =>
            mutations.updateMutateAsync({ id, status })
          )
        );
        const { succeeded, failed } = countResults(results);
        showResult(succeeded, failed, 'updated');
        finalize();
      } finally {
        setIsPending(false);
      }
    },
    [selectedIds, mutations, showResult, finalize]
  );

  return {
    isPending,
    confirmAction,
    requestBulkTrash,
    executeBulkTrash,
    executeBulkRestore,
    dismissConfirm,
    executeBulkStatusChange,
  };
}
