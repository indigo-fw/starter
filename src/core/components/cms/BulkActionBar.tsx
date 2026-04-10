'use client';

import { useState } from 'react';
import { Download, Loader2, Trash2, Undo2 } from 'lucide-react';

import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { ContentStatus } from '@/core/types/cms';

interface BulkActionBarProps {
  selectedCount: number;
  trashed: boolean;
  onBulkTrash: () => void;
  onBulkRestore: () => void;
  onBulkStatusChange: (status: number) => void;
  onDeselectAll: () => void;
  isPending: boolean;
  onBulkExport?: (format: 'json' | 'csv') => void;
}

export default function BulkActionBar({
  selectedCount,
  trashed,
  onBulkTrash,
  onBulkRestore,
  onBulkStatusChange,
  onDeselectAll,
  isPending,
  onBulkExport,
}: BulkActionBarProps) {
  const __ = useAdminTranslations();
  const [exportOpen, setExportOpen] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="bulk-action-bar mt-3 flex items-center justify-between rounded-lg border border-(--border-primary) bg-(--surface-secondary) px-4 py-3">
      <div className="bulk-actions-info flex items-center gap-3">
        {isPending && (
          <Loader2 size={16} className="animate-spin text-(--text-muted)" />
        )}
        <span className="text-sm font-medium text-(--text-primary)">
          {selectedCount}{' '}
          {__(selectedCount === 1 ? 'item selected' : 'items selected')}
        </span>
        <button
          type="button"
          onClick={onDeselectAll}
          className="text-sm text-(--text-muted) underline hover:text-(--text-primary)"
        >
          {__('Deselect all')}
        </button>
      </div>
      <div className="bulk-actions-buttons flex items-center gap-2">
        {trashed ? (
          <button
            type="button"
            onClick={onBulkRestore}
            disabled={isPending}
            className="btn btn-secondary gap-1 text-sm disabled:opacity-50"
          >
            <Undo2 size={14} />
            {__('Restore')}
          </button>
        ) : (
          <>
            <select
              onChange={(e) => {
                const val = e.target.value;
                if (val !== '') onBulkStatusChange(Number(val));
                e.target.value = '';
              }}
              defaultValue=""
              disabled={isPending}
              className="rounded-md border border-(--border-primary) px-2 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="" disabled>
                {__('Set status...')}
              </option>
              <option value={ContentStatus.DRAFT}>{__('Draft')}</option>
              <option value={ContentStatus.PUBLISHED}>{__('Published')}</option>
            </select>
            {onBulkExport && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setExportOpen(!exportOpen)}
                  disabled={isPending}
                  className="btn btn-secondary gap-1 text-sm disabled:opacity-50"
                >
                  <Download size={14} />
                  {__('Export')}
                </button>
                {exportOpen && (
                  <div className="absolute right-0 bottom-full z-10 mb-1 w-28 rounded-md border border-(--border-primary) bg-(--surface-primary) py-1 shadow-lg">
                    <button
                      onClick={() => { onBulkExport('json'); setExportOpen(false); }}
                      className="block w-full px-3 py-1.5 text-left text-sm text-(--text-secondary) hover:bg-(--surface-secondary)"
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => { onBulkExport('csv'); setExportOpen(false); }}
                      className="block w-full px-3 py-1.5 text-left text-sm text-(--text-secondary) hover:bg-(--surface-secondary)"
                    >
                      CSV
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onBulkTrash}
              disabled={isPending}
              className="btn gap-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/15 disabled:opacity-50"
            >
              <Trash2 size={14} />
              {__('Move to Trash')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
