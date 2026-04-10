"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import {
  X,
  Upload,
  Loader2,
  Image as ImageIcon,
  Check,
  Search,
  Trash2,
} from "lucide-react";

import { trpc } from "@/lib/trpc/client";
import { useAdminTranslations } from "@/core/lib/i18n/translations";
import { FileType } from "@/core/types/cms";
import { toast } from "@/core/store/toast-store";
import { cn } from "@/lib/utils";
import { Dialog } from "@/core/components/overlays/Dialog";
import { ConfirmDialog } from "@/core/components/overlays/ConfirmDialog";

export interface MediaPickerDialogProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, alt?: string) => void;
  /** Pre-filter by file type (e.g., FileType.IMAGE for featured image picker). Undefined = all types. */
  defaultFileType?: number;
  /** Lock the file type filter — hides the dropdown when set */
  lockFileType?: boolean;
  /** Pre-filter by uploader user ID */
  defaultUserId?: string;
  /** Show user filter dropdown (for admin to browse other users' media) */
  showUserFilter?: boolean;
}

export function MediaPickerDialog({
  open,
  onClose,
  onSelect,
  defaultFileType = FileType.IMAGE,
  lockFileType = false,
  defaultUserId,
  showUserFilter = false,
}: MediaPickerDialogProps) {
  const __ = useAdminTranslations();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [fileTypeFilter, setFileTypeFilter] = useState<number | undefined>(defaultFileType);
  const [userIdFilter, setUserIdFilter] = useState<string | undefined>(defaultUserId);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const mediaList = trpc.media.list.useQuery(
    {
      page,
      pageSize: 20,
      fileType: fileTypeFilter,
      uploadedById: userIdFilter || undefined,
      search: searchDebounced || undefined,
    },
    { enabled: open },
  );

  // User list for filter (only fetched when showUserFilter is true)
  const userList = trpc.users.list.useQuery(
    { page: 1, pageSize: 100 },
    { enabled: open && showUserFilter },
  );

  const registerMedia = trpc.media.register.useMutation({
    onSuccess: () => utils.media.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const updateMedia = trpc.media.update.useMutation({
    onSuccess: () => utils.media.list.invalidate(),
  });

  const deleteMedia = trpc.media.delete.useMutation({
    onSuccess: () => {
      utils.media.list.invalidate();
      setSelectedId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const data = mediaList.data;
  const selectedItem = data?.results.find((m) => m.id === selectedId);

  // ── Upload handler (shared by button + drag-drop) ──────────
  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      setUploading(true);
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(__("Only image files are supported"));
          continue;
        }
        try {
          const formData = new FormData();
          formData.append("file", file);
          const res = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) {
            const err = (await res.json()) as { error?: string };
            toast.error(err.error ?? "Upload failed");
            continue;
          }
          const result = (await res.json()) as {
            filename: string;
            filepath: string;
            mimeType: string;
            fileSize: number;
            width?: number;
            height?: number;
            thumbnailPath?: string;
            mediumPath?: string;
            blurDataUrl?: string;
          };
          await registerMedia.mutateAsync({
            filename: result.filename,
            filepath: result.filepath,
            mimeType: result.mimeType,
            fileSize: result.fileSize,
            width: result.width,
            height: result.height,
            thumbnailPath: result.thumbnailPath,
            mediumPath: result.mediumPath,
            blurDataUrl: result.blurDataUrl,
          });
        } catch {
          toast.error(__("Failed to upload {name}", { name: file.name }));
        }
      }
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [__, registerMedia],
  );

  // ── Drag-drop handlers ─────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only leave if actually leaving the drop zone
    if (
      dropZoneRef.current &&
      !dropZoneRef.current.contains(e.relatedTarget as Node)
    ) {
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) uploadFiles(files);
    },
    [uploadFiles],
  );

  function handleConfirm() {
    if (!selectedItem) return;
    onSelect(selectedItem.url, selectedItem.altText ?? undefined);
    onClose();
    setSelectedId(null);
    setSearch("");
  }

  function handleClose() {
    onClose();
    setSelectedId(null);
    setSearch("");
  }

  return (
    <>
    <Dialog
      open={open}
      onClose={handleClose}
      size="5xl"
      zoomFromClick
      className="max-w-7xl! h-[calc(100vh-80px)]"
    >
      {/* Header */}
      <div className="media-picker-header flex items-center justify-between border-b border-(--border-primary) bg-(--surface-inset) px-6 py-3 rounded-t-lg shrink-0">
        <h2 className="text-lg font-semibold text-(--text-primary)">
          {__("Media Library")}
        </h2>
        <div className="media-picker-header-actions flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={__("Search media...")}
              className="input pl-9 w-56 text-sm"
            />
          </div>
          {/* Type filter */}
          {!lockFileType && (
            <select
              value={fileTypeFilter ?? ''}
              onChange={(e) => {
                setFileTypeFilter(e.target.value ? Number(e.target.value) : undefined);
                setPage(1);
              }}
              className="select text-sm h-9"
            >
              <option value="">{__("All types")}</option>
              <option value={FileType.IMAGE}>{__("Images")}</option>
              <option value={FileType.VIDEO}>{__("Videos")}</option>
              <option value={FileType.DOCUMENT}>{__("Documents")}</option>
              <option value={FileType.OTHER}>{__("Other")}</option>
            </select>
          )}
          {/* User filter */}
          {showUserFilter && (
            <select
              value={userIdFilter ?? ''}
              onChange={(e) => {
                setUserIdFilter(e.target.value || undefined);
                setPage(1);
              }}
              className="select text-sm h-9"
            >
              <option value="">{__("All users")}</option>
              {(userList.data?.results ?? []).map((u: { id: string; name: string; email: string }) => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
          )}
          {/* Upload button */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={fileTypeFilter === FileType.IMAGE ? "image/*" : fileTypeFilter === FileType.VIDEO ? "video/*" : "*/*"}
            onChange={(e) => {
              if (e.target.files) uploadFiles(e.target.files);
            }}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn btn-primary"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {__("Upload")}
          </button>
          <button
            onClick={handleClose}
            className="rounded p-1 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body: Grid + Detail panel */}
      <div
        ref={dropZoneRef}
        className={cn(
          "flex flex-1 min-h-0 transition-colors",
          dragOver &&
            "bg-brand-50 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.05)]",
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Drag-drop overlay */}
          {dragOver && (
            <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-brand-400 py-12 mb-4">
              <div className="text-center">
                <Upload className="mx-auto h-8 w-8 text-brand-500" />
                <p className="mt-2 text-sm font-medium text-brand-600 dark:text-brand-400">
                  {__("Drop files to upload")}
                </p>
              </div>
            </div>
          )}

          {mediaList.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
            </div>
          ) : (data?.results ?? []).length === 0 ? (
            <div className="media-picker-empty flex flex-col items-center justify-center py-12">
              <ImageIcon className="h-12 w-12 text-(--text-muted)" />
              <p className="mt-4 text-sm text-(--text-muted)">
                {search
                  ? __("No images match your search.")
                  : __("No images yet. Upload or drag files here.")}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 lg:grid-cols-6">
                {(data?.results ?? []).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setSelectedId(item.id === selectedId ? null : item.id)
                    }
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-lg border-2 transition-colors",
                      selectedId === item.id
                        ? "border-brand-500 ring-2 ring-brand-200 dark:ring-[oklch(0.65_0.17_var(--brand-hue)_/_0.25)]"
                        : "border-transparent hover:border-(--border-primary)",
                    )}
                  >
                    <Image
                      src={item.url}
                      alt={item.altText ?? item.filename}
                      fill
                      className="object-cover"
                    />
                    {selectedId === item.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-brand-500/20">
                        <div className="rounded-full bg-brand-500 p-1">
                          <Check className="h-4 w-4 text-white" />
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {data && data.totalPages > 1 && (
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="btn btn-secondary text-xs disabled:opacity-40"
                  >
                    {__("Previous")}
                  </button>
                  <span className="px-3 py-1 text-xs text-(--text-muted)">
                    {page} / {data.totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(data.totalPages, p + 1))
                    }
                    disabled={page >= data.totalPages}
                    className="btn btn-secondary text-xs disabled:opacity-40"
                  >
                    {__("Next")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail panel — always visible */}
        <div className="w-72 shrink-0 border-l border-(--border-primary) bg-(--surface-inset) overflow-y-auto">
          {selectedItem ? (
            <div key={selectedItem.id} className="p-4 space-y-4">
              {/* Preview */}
              <div className="relative w-full max-h-48 h-48">
                <Image
                  src={selectedItem.url}
                  alt={selectedItem.altText ?? selectedItem.filename}
                  fill
                  className="rounded-lg border border-(--border-primary) object-contain"
                />
              </div>

              {/* Filename */}
              <div
                className="text-xs text-(--text-muted) truncate"
                title={selectedItem.filename}
              >
                {selectedItem.filename}
              </div>

              {/* File info */}
              <div className="text-xs text-(--text-muted) space-y-0.5">
                {selectedItem.width && selectedItem.height && (
                  <div>
                    {selectedItem.width} x {selectedItem.height}px
                  </div>
                )}
                <div>{(selectedItem.fileSize / 1024).toFixed(1)} KB</div>
              </div>

              {/* Editable fields */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-(--text-secondary) mb-1">
                    {__("Title")}
                  </label>
                  <input
                    type="text"
                    defaultValue={selectedItem.title ?? ""}
                    onBlur={(e) => {
                      updateMedia.mutate({
                        id: selectedItem.id,
                        title: e.target.value,
                      });
                    }}
                    className="input w-full text-sm"
                    placeholder={__("Image title")}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-(--text-secondary) mb-1">
                    {__("Alt Text")}
                  </label>
                  <input
                    type="text"
                    defaultValue={selectedItem.altText ?? ""}
                    onBlur={(e) => {
                      updateMedia.mutate({
                        id: selectedItem.id,
                        altText: e.target.value,
                      });
                    }}
                    className="input w-full text-sm"
                    placeholder={__("Describe the image")}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-(--text-secondary) mb-1">
                    {__("Description")}
                  </label>
                  <textarea
                    defaultValue={selectedItem.description ?? ""}
                    onBlur={(e) => {
                      updateMedia.mutate({
                        id: selectedItem.id,
                        description: e.target.value,
                      });
                    }}
                    rows={3}
                    className="textarea w-full text-sm"
                    placeholder={__("Optional description")}
                  />
                </div>
              </div>

              {/* Delete */}
              <button
                type="button"
                onClick={() => setConfirmDeleteId(selectedItem.id)}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {__("Delete")}
              </button>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center p-4">
              <p className="text-center text-sm text-(--text-muted)">
                {__("Select an image to view details")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="media-picker-footer flex items-center justify-between border-t border-(--border-primary) bg-(--surface-inset) px-6 py-3 rounded-b-lg shrink-0">
        <div className="text-sm text-(--text-muted)">
          {selectedItem ? selectedItem.filename : __("No image selected")}
        </div>
        <div className="flex gap-2">
          <button onClick={handleClose} className="btn btn-secondary">
            {__("Cancel")}
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedItem}
            className="btn btn-primary disabled:opacity-50"
          >
            {__("Select")}
          </button>
        </div>
      </div>
    </Dialog>

    <ConfirmDialog
      open={!!confirmDeleteId}
      title={__("Delete media file?")}
      message={__("This file will be permanently deleted.")}
      confirmLabel={__("Delete")}
      variant="danger"
      onConfirm={() => {
        if (confirmDeleteId) deleteMedia.mutate({ id: confirmDeleteId });
        setConfirmDeleteId(null);
      }}
      onCancel={() => setConfirmDeleteId(null)}
    />
    </>
  );
}
