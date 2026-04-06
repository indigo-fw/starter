'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ImageIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAdminTranslations } from '@/core/lib/translations';
import { FileType } from '@/core/types/cms';
import { MediaPickerDialog } from './MediaPickerDialog';
import type { MediaPickerDialogProps } from './MediaPickerDialog';

export interface MediaPickerButtonProps
  extends Omit<MediaPickerDialogProps, 'open' | 'onClose' | 'onSelect'> {
  /** Current image/file URL */
  value?: string;
  /** Alt text for the current image */
  alt?: string;
  /** Called when a file is selected or removed. url is empty string on remove. */
  onChange: (url: string, alt?: string) => void;
  /** Custom trigger content (replaces default empty-state placeholder) */
  children?: React.ReactNode;
  /** Show alt text input below the preview */
  showAltInput?: boolean;
  /** Additional className on the wrapper */
  className?: string;
}

export function MediaPickerButton({
  value,
  alt,
  onChange,
  children,
  showAltInput = false,
  className,
  defaultFileType = FileType.IMAGE,
  lockFileType,
  defaultUserId,
  showUserFilter,
}: MediaPickerButtonProps) {
  const __ = useAdminTranslations();
  const [open, setOpen] = useState(false);
  const isImage = defaultFileType === FileType.IMAGE || !defaultFileType;

  return (
    <div className={cn('space-y-2', className)}>
      {value ? (
        <>
          {/* Preview */}
          <div className="relative">
            {isImage ? (
              <div className="relative h-32 w-full">
                <Image
                  src={value}
                  alt={alt || ''}
                  fill
                  className="rounded-md border border-(--border-primary) object-cover"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-(--border-primary) px-3 py-2 text-sm text-(--text-secondary)">
                <ImageIcon className="h-4 w-4" />
                <span className="truncate">{value.split('/').pop()}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => onChange('', '')}
              className="absolute right-1 top-1 rounded bg-(--surface-primary)/90 p-1 shadow-sm hover:bg-(--surface-primary)"
            >
              <X className="h-3.5 w-3.5 text-(--text-secondary)" />
            </button>
          </div>
          {/* Change button */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs text-brand-600 hover:text-brand-700"
          >
            {__('Change')}
          </button>
        </>
      ) : (
        /* Empty state trigger */
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-(--border-primary) px-4 py-6 text-sm text-(--text-muted) hover:border-(--text-muted) hover:text-(--text-secondary) transition-colors"
        >
          {children ?? (
            <>
              <ImageIcon className="h-5 w-5" />
              {__('Select Image')}
            </>
          )}
        </button>
      )}

      {/* Alt text input */}
      {showAltInput && value && (
        <div>
          <label className="block text-sm font-medium text-(--text-secondary)">
            {__('Alt Text')}
          </label>
          <input
            type="text"
            value={alt ?? ''}
            onChange={(e) => onChange(value, e.target.value)}
            placeholder={__('Describe the image...')}
            className="input mt-1 text-sm"
          />
        </div>
      )}

      <MediaPickerDialog
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(url, selectedAlt) => {
          onChange(url, selectedAlt);
          setOpen(false);
        }}
        defaultFileType={defaultFileType}
        lockFileType={lockFileType}
        defaultUserId={defaultUserId}
        showUserFilter={showUserFilter}
      />
    </div>
  );
}
