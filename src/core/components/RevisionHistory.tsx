'use client';

import { useCallback, useMemo, useState } from 'react';

import { History, RotateCcw } from 'lucide-react';

import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { computeFieldDiffs } from '@/core/lib/content/revision-diff';
import type { FieldDiff } from '@/core/lib/content/revision-diff';
import { trpc } from '@/lib/trpc/client';
import { toast } from '@/core/store/toast-store';
import { Dialog } from '@/core/components/Dialog';
import { ConfirmDialog } from '@/core/components/ConfirmDialog';
import { cn } from '@/lib/utils';

interface Props {
  contentType: string;
  contentId: string;
  currentData: Record<string, unknown>;
  onRestored?: () => void;
  /** Controlled open state — when provided, the component acts as a controlled dialog (no trigger card). */
  open?: boolean;
  /** Called when the dialog requests close. */
  onClose?: () => void;
}

export function RevisionHistory({ contentType, contentId, currentData, onRestored, open: controlledOpen, onClose }: Props) {
  const __ = useAdminTranslations();
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data: revisionCount } = trpc.revisions.count.useQuery(
    { contentType, contentId },
  );

  const revisions = trpc.revisions.list.useQuery(
    { contentType, contentId },
    { enabled: isOpen }
  );

  const restoreMutation = trpc.revisions.restore.useMutation();
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const selectedRevision = revisions.data?.[selectedIndex];
  const snapshot = selectedRevision?.snapshot as Record<string, unknown> | undefined;

  const diffs = useMemo<FieldDiff[]>(() => {
    if (!snapshot) return [];
    return computeFieldDiffs(snapshot, currentData);
  }, [snapshot, currentData]);

  const openDialog = useCallback(() => {
    if (!isControlled) setInternalOpen(true);
    setSelectedIndex(0);
  }, [isControlled]);

  const closeDialog = useCallback(() => {
    if (!isControlled) setInternalOpen(false);
    setSelectedIndex(0);
    onClose?.();
  }, [isControlled, onClose]);

  async function handleRestore() {
    if (!selectedRevision) return;
    try {
      setRestoring(true);
      await restoreMutation.mutateAsync({ id: selectedRevision.id });
      toast.success(__('Revision restored'));
      onRestored?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : __('Failed to restore revision'));
    } finally {
      setRestoring(false);
      setConfirmRestore(false);
    }
  }

  // ── Revision dialog using engine Dialog component ──
  const dialogElement = (
    <>
      <Dialog
        open={isOpen}
        onClose={closeDialog}
        size="5xl"
        zoomFromClick
        className="h-[85vh]"
      >
        {/* Header */}
        <Dialog.Header onClose={closeDialog}>
          {__('Revision History')}
        </Dialog.Header>

        {/* Timeline slider */}
        {revisions.data && revisions.data.length > 1 && (
          <div className="border-b border-(--border-primary) px-5 py-3">
            <input
              type="range"
              min={0}
              max={revisions.data.length - 1}
              value={revisions.data.length - 1 - selectedIndex}
              onChange={(e) =>
                setSelectedIndex(revisions.data!.length - 1 - Number(e.target.value))
              }
              className="w-full accent-brand-500"
            />
            <div className="flex justify-between text-xs text-(--text-muted)">
              <span>{__('Oldest')}</span>
              <span>{__('Newest')}</span>
            </div>
          </div>
        )}

        {/* Body: split panel */}
        {!revisions.data?.length ? (
          <div className="flex-1 p-8 text-center text-(--text-muted)">
            {__('No revisions yet')}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Left panel — revision list */}
            <div className="flex w-[35%] flex-col border-r border-(--border-primary)">
              <div className="flex-1 overflow-y-auto p-3">
                <div className="space-y-1">
                  {revisions.data.map((rev, idx) => {
                    const snap = rev.snapshot as Record<string, unknown>;
                    const title = (snap.title as string) || (snap.name as string) || __('(untitled)');
                    return (
                      <button
                        key={rev.id}
                        type="button"
                        onClick={() => setSelectedIndex(idx)}
                        className={cn(
                          'w-full rounded-md px-3 py-2 text-left transition-colors',
                          selectedIndex === idx
                            ? 'bg-[oklch(0.55_0.20_var(--brand-hue)_/_0.12)] text-brand-600 dark:text-brand-400'
                            : 'text-(--text-secondary) hover:bg-(--surface-secondary)',
                        )}
                      >
                        <div className="truncate text-sm font-medium">{title}</div>
                        <div className="text-xs text-(--text-muted)">
                          {new Date(rev.createdAt).toLocaleString()}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right panel — field diffs */}
            <div className="flex w-[65%] flex-col">
              <div className="flex-1 overflow-y-auto p-4">
                {diffs.length === 0 ? (
                  <div className="py-8 text-center text-(--text-muted)">
                    {__('No changes in this revision')}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {diffs.map((diff) => (
                      <div key={diff.key}>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-(--text-muted)">
                          {diff.label}
                        </div>
                        {diff.type === 'long' && diff.lines ? (
                          <div className="rounded border border-(--border-primary) bg-(--surface-secondary) p-2 font-mono text-xs">
                            {diff.lines.map((line, i) => (
                              <div
                                key={i}
                                className={cn(
                                  'whitespace-pre-wrap',
                                  line.type === 'added' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                                  line.type === 'removed' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                                  line.type === 'unchanged' && 'text-(--text-muted)',
                                )}
                              >
                                {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
                                {line.text}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm">
                            <del className="text-red-600 dark:text-red-400">{String(diff.oldValue ?? '')}</del>
                            <span className="mx-2 text-(--text-muted)">&rarr;</span>
                            <ins className="text-green-600 no-underline dark:text-green-400">{String(diff.newValue ?? '')}</ins>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedRevision && (
                <div className="border-t border-(--border-primary) p-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => setConfirmRestore(true)}
                    disabled={restoring}
                    className="flex items-center gap-2 rounded-lg border border-amber-600 px-4 py-2 text-sm text-amber-500 transition-colors hover:bg-amber-600 hover:text-white disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {__('Restore this version')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmRestore}
        title={__('Restore revision?')}
        message={__('Current state will be saved as a new revision before restoring.')}
        confirmLabel={__('Restore')}
        variant="default"
        onConfirm={handleRestore}
        onCancel={() => setConfirmRestore(false)}
      />
    </>
  );

  // Controlled mode — render dialog only (no trigger card)
  if (isControlled) {
    return dialogElement;
  }

  return (
    <div className="card p-6">
      <button
        type="button"
        onClick={openDialog}
        className="flex w-full items-center gap-2"
      >
        <h3 className="h2 flex items-center gap-2">
          <History className="h-4 w-4" />
          {__('Revisions')}
          {(revisionCount ?? 0) > 0 && (
            <span className="rounded-full bg-(--surface-secondary) px-2 py-0.5 text-xs text-(--text-muted)">
              {revisionCount}
            </span>
          )}
        </h3>
      </button>
      {dialogElement}
    </div>
  );
}
