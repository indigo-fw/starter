'use client';

import { useCallback, useRef, useState } from 'react';
import {
  File,
  FileImage,
  FileVideo,
  FileText,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/core/lib/i18n/translations';
import { FileType } from '@/core/types/cms';
import { toast } from '@/core/store/toast-store';

interface Props {
  postId: string | undefined;
  uploadEndpoint?: string;
}

const FILE_TYPE_ICONS: Record<number, React.ElementType> = {
  [FileType.IMAGE]: FileImage,
  [FileType.VIDEO]: FileVideo,
  [FileType.DOCUMENT]: FileText,
  [FileType.OTHER]: File,
};

function mimeToFileType(mime: string): number {
  if (mime.startsWith('image/')) return FileType.IMAGE;
  if (mime.startsWith('video/')) return FileType.VIDEO;
  if (
    mime.startsWith('application/pdf') ||
    mime.startsWith('text/') ||
    mime.includes('document') ||
    mime.includes('spreadsheet')
  )
    return FileType.DOCUMENT;
  return FileType.OTHER;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PostAttachments({ postId, uploadEndpoint = '/api/upload' }: Props) {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingAlt, setEditingAlt] = useState<{ id: string; altText: string } | null>(
    null
  );

  const attachments = trpc.cms.listAttachments.useQuery(
    { postId: postId! },
    { enabled: !!postId }
  );

  const addAttachment = trpc.cms.addAttachment.useMutation({
    onSuccess: () => {
      utils.cms.listAttachments.invalidate({ postId: postId! });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateAttachment = trpc.cms.updateAttachment.useMutation({
    onSuccess: () => {
      toast.success(__('Alt text updated'));
      utils.cms.listAttachments.invalidate({ postId: postId! });
      setEditingAlt(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteAttachment = trpc.cms.deleteAttachment.useMutation({
    onSuccess: () => {
      toast.success(__('Attachment removed'));
      utils.cms.listAttachments.invalidate({ postId: postId! });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !postId) return;

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(uploadEndpoint, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? 'Upload failed');
        }

        const data = await res.json();

        await addAttachment.mutateAsync({
          postId,
          filepath: data.filepath,
          filename: data.filename,
          mimeType: data.mimeType,
          fileSize: data.fileSize,
          fileType: mimeToFileType(data.mimeType),
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [postId, addAttachment, uploadEndpoint]
  );

  if (!postId) {
    return (
      <div className="card p-4">
        <h3 className="h2 text-sm">{__('Attachments')}</h3>
        <p className="mt-2 text-xs text-(--text-muted)">
          {__('Save the post first to add attachments.')}
        </p>
      </div>
    );
  }

  const items = attachments.data ?? [];

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="h2 text-sm">{__('Attachments')}</h3>
        <label className="btn btn-secondary cursor-pointer text-xs">
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {__('Upload')}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {attachments.isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-(--text-muted)" />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 text-xs text-(--text-muted)">{__('No attachments yet.')}</p>
      ) : (
        <ul className="attachment-list mt-3 space-y-2">
          {items.map((att) => {
            const Icon = FILE_TYPE_ICONS[att.fileType] ?? File;
            return (
              <li
                key={att.id}
                className="attachment-item flex items-center gap-2 rounded border border-(--border-primary) p-2 text-xs"
              >
                <Icon className="h-4 w-4 shrink-0 text-(--text-muted)" />
                <div className="attachment-info min-w-0 flex-1">
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate font-medium text-(--text-primary) hover:underline"
                  >
                    {att.filename}
                  </a>
                  <span className="attachment-meta text-(--text-muted)">
                    {formatFileSize(att.fileSize)}
                    {att.altText && (
                      <span className="ml-2">alt: {att.altText}</span>
                    )}
                  </span>
                </div>
                <div className="attachment-actions flex shrink-0 gap-1">
                  <button
                    onClick={() =>
                      setEditingAlt({ id: att.id, altText: att.altText ?? '' })
                    }
                    className="rounded p-1 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-brand-600"
                    title={__('Edit alt text')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteAttachment.mutate({ id: att.id })}
                    className="rounded p-1 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-red-600"
                    title={__('Remove')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Alt text edit dialog */}
      {editingAlt && (
        <dialog
          open
          className="fixed inset-0 z-50 m-auto w-full max-w-sm rounded-lg border border-(--border-primary) bg-(--surface-primary) p-0 shadow-xl backdrop:bg-black/30"
        >
          <div className="attachments-dialog-body p-4">
            <div className="attachments-dialog-header flex items-center justify-between">
              <h4 className="text-sm font-semibold text-(--text-primary)">
                {__('Edit Alt Text')}
              </h4>
              <button
                onClick={() => setEditingAlt(null)}
                className="text-(--text-muted) hover:text-(--text-primary)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="text"
              value={editingAlt.altText}
              onChange={(e) =>
                setEditingAlt({ ...editingAlt, altText: e.target.value })
              }
              placeholder={__('Describe this file...')}
              className="input mt-3"
            />
            <div className="attachments-dialog-actions mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditingAlt(null)}
                className="btn btn-secondary text-xs"
              >
                {__('Cancel')}
              </button>
              <button
                onClick={() =>
                  updateAttachment.mutate({
                    id: editingAlt.id,
                    altText: editingAlt.altText || null,
                  })
                }
                disabled={updateAttachment.isPending}
                className="btn btn-primary text-xs disabled:opacity-50"
              >
                {__('Save')}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
