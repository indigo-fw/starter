'use client';

import { useState, useRef } from 'react';
import {
  Upload,
  Image as ImageIcon,
  File,
  Film,
  FileText,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';

import Image from 'next/image';
import { trpc } from '@/lib/trpc/client';
import { useAdminTranslations } from '@/lib/translations';
import { FileType } from '@/core/types/cms';
import { apiRoutes } from '@/config/routes';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const FILE_TYPE_ICONS: Record<number, React.ElementType> = {
  [FileType.IMAGE]: ImageIcon,
  [FileType.VIDEO]: Film,
  [FileType.DOCUMENT]: FileText,
  [FileType.OTHER]: File,
};

type FilterTab = 'all' | number;

export default function MediaPage() {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [filterType, setFilterType] = useState<FilterTab>('all');
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    filename: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const mediaList = trpc.media.list.useQuery({
    page,
    pageSize: 20,
    fileType: filterType === 'all' ? undefined : filterType,
  });

  const registerMedia = trpc.media.register.useMutation({
    onSuccess: () => {
      utils.media.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMedia = trpc.media.delete.useMutation({
    onSuccess: () => {
      toast.success(__('File deleted'));
      utils.media.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const data = mediaList.data;

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    let uploaded = 0;

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(apiRoutes.upload, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          toast.error(err.error ?? __('Upload failed'));
          continue;
        }

        const result = await res.json();

        // Register in media library
        await registerMedia.mutateAsync({
          filename: result.filename,
          filepath: result.filepath,
          mimeType: result.mimeType,
          fileSize: result.fileSize,
        });

        uploaded++;
      } catch {
        toast.error(__('Failed to upload {name}', { name: file.name }));
      }
    }

    if (uploaded > 0) {
      toast.success(__._n('1 file uploaded', '{count} files uploaded', uploaded));
    }

    setUploading(false);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleCopyUrl(url: string, id: string) {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMedia.mutate({ id: deleteTarget.id });
    setDeleteTarget(null);
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(date: Date | string | null) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: FileType.IMAGE, label: 'Images' },
    { key: FileType.VIDEO, label: 'Videos' },
    { key: FileType.DOCUMENT, label: 'Documents' },
    { key: FileType.OTHER, label: 'Other' },
  ];

  return (
    <>
      <header className="dash-header">
        <div className="dash-toolbar">
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Media Library')}</h1>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleUpload}
              className="hidden"
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn btn-primary disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? __('Uploading...') : __('Upload')}
            </button>
          </div>
        </div>
      </header>
      <main className="dash-main"><div className="dash-inner media-page">
      {/* Type filter tabs */}
      <div className="mt-4 flex gap-1 border-b border-(--border-primary)">
        {filterTabs.map((t) => (
          <button
            key={String(t.key)}
            onClick={() => {
              setFilterType(t.key);
              setPage(1);
            }}
            className={cn(
              'border-b-2 px-3 pb-2 text-sm font-medium transition-colors',
              filterType === t.key
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-(--text-muted) hover:border-(--border-primary) hover:text-(--text-primary)'
            )}
          >
            {__(t.label)}
          </button>
        ))}
      </div>

      {/* Media grid */}
      <div className="mt-4">
        {mediaList.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : (data?.results ?? []).length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-16">
            <ImageIcon className="h-12 w-12 text-(--text-muted)" />
            <p className="mt-4 text-sm text-(--text-muted)">{__('No media files yet.')}</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-secondary mt-4"
            >
              <Upload className="h-4 w-4" />
              {__('Upload your first file')}
            </button>
          </div>
        ) : (
          <div className="media-grid grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {(data?.results ?? []).map((item) => {
              const FileIcon = FILE_TYPE_ICONS[item.fileType] ?? File;
              const isImage = item.fileType === FileType.IMAGE;

              return (
                <div
                  key={item.id}
                  className="card group relative overflow-hidden"
                >
                  {/* Preview */}
                  <div className="relative aspect-square bg-(--surface-secondary)">
                    {isImage ? (
                      <Image
                        src={item.url ?? ''}
                        alt={item.altText ?? item.filename}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <FileIcon className="h-12 w-12 text-(--text-muted)" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="media-card-info p-2">
                    <p
                      className="media-filename truncate text-xs font-medium text-(--text-secondary)"
                      title={item.filename}
                    >
                      {item.filename}
                    </p>
                    <p className="media-meta text-xs text-(--text-muted)">
                      {formatSize(item.fileSize)} · {formatDate(item.createdAt)}
                    </p>
                  </div>

                  {/* Actions overlay */}
                  <div className="media-card-overlay-actions absolute inset-x-0 top-0 flex justify-end gap-1 p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() =>
                        handleCopyUrl(
                          item.url ?? '',
                          item.id
                        )
                      }
                      className="rounded bg-(--surface-primary) p-1.5 shadow-sm hover:bg-(--surface-primary)"
                      title={__('Copy URL')}
                    >
                      {copiedId === item.id ? (
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-(--text-secondary)" />
                      )}
                    </button>
                    <button
                      onClick={() =>
                        setDeleteTarget({
                          id: item.id,
                          filename: item.filename,
                        })
                      }
                      className="rounded bg-(--surface-primary) p-1.5 shadow-sm hover:bg-(--surface-primary)"
                      title={__('Delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="media-pagination mt-4 flex items-center justify-between">
          <p className="pagination-info text-sm text-(--text-muted)">
            {__('Page')} {data.page} {__('of')} {data.totalPages} ({data.total}{' '}
            {__('total')})
          </p>
          <div className="media-pagination-buttons flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-secondary disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="btn btn-secondary disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={__('Delete file?')}
        message={__('"{name}" will be deleted.', { name: deleteTarget?.filename ?? '' })}
        confirmLabel={__('Delete')}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div></main>
    </>
  );
}
