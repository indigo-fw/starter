'use client';

import { useCallback, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Info, AlertTriangle, CheckCircle, XCircle, X, Pencil, MousePointer, Play, Images } from 'lucide-react';

import Image from 'next/image';
import { getShortcodeDef } from '@/lib/shortcodes/registry';
import { cn } from '@/lib/utils';
import { ShortcodeEditDialog } from '@/core/components/shortcodes/ShortcodeEditDialog';

const CALLOUT_STYLES: Record<string, { icon: typeof Info; bg: string }> = {
  info: { icon: Info, bg: 'bg-brand-50 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.10)] border-brand-200 dark:border-[oklch(0.65_0.17_var(--brand-hue)_/_0.30)]' },
  warning: { icon: AlertTriangle, bg: 'bg-yellow-50 dark:bg-yellow-500/10 border-yellow-200 dark:border-yellow-500/30' },
  success: { icon: CheckCircle, bg: 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30' },
  error: { icon: XCircle, bg: 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30' },
};

const SHORTCODE_ICONS: Record<string, typeof Info> = {
  callout: Info,
  cta: MousePointer,
  youtube: Play,
  gallery: Images,
};

export function ShortcodeNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const [editOpen, setEditOpen] = useState(false);
  const name = node.attrs.shortcodeName as string;
  let attrs: Record<string, string> = {};
  try {
    attrs = JSON.parse((node.attrs.shortcodeAttrs as string) || '{}') as Record<string, string>;
  } catch {
    // Malformed JSON — use empty attrs
  }
  const content = node.attrs.shortcodeContent as string;
  const def = getShortcodeDef(name);

  const handleSave = useCallback(
    (newAttrs: Record<string, string>, newContent: string) => {
      updateAttributes({
        shortcodeAttrs: JSON.stringify(newAttrs),
        shortcodeContent: newContent,
      });
      setEditOpen(false);
    },
    [updateAttributes]
  );

  // Callout preview
  if (name === 'callout') {
    const style = CALLOUT_STYLES[attrs.type ?? 'info'] ?? CALLOUT_STYLES.info;
    const Icon = style.icon;
    return (
      <NodeViewWrapper>
        <div className={cn('relative my-2 rounded-md border p-3', style.bg)}>
          <div className="flex gap-2">
            <Icon className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="text-sm">{content || '(empty callout)'}</span>
          </div>
          <div className="absolute right-1 top-1 flex gap-0.5">
            <button type="button" onClick={() => setEditOpen(true)} className="rounded p-1 hover:bg-black/10 dark:hover:bg-white/10">
              <Pencil className="h-3 w-3" />
            </button>
            <button type="button" onClick={deleteNode} className="rounded p-1 hover:bg-black/10 dark:hover:bg-white/10">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
        {editOpen && def && (
          <ShortcodeEditDialog def={def} attrs={attrs} content={content} onSave={handleSave} onClose={() => setEditOpen(false)} />
        )}
      </NodeViewWrapper>
    );
  }

  // CTA preview
  if (name === 'cta') {
    return (
      <NodeViewWrapper>
        <div className="relative my-2 rounded-md border border-(--border-primary) p-3 text-center">
          <span className="inline-block rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white">
            {attrs.text || 'CTA Button'}
          </span>
          <p className="mt-1 text-xs text-(--text-muted)">{attrs.url || 'No URL'}</p>
          <div className="absolute right-1 top-1 flex gap-0.5">
            <button type="button" onClick={() => setEditOpen(true)} className="rounded p-1 hover:bg-(--surface-secondary)">
              <Pencil className="h-3 w-3" />
            </button>
            <button type="button" onClick={deleteNode} className="rounded p-1 hover:bg-(--surface-secondary)">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
        {editOpen && def && (
          <ShortcodeEditDialog def={def} attrs={attrs} content={content} onSave={handleSave} onClose={() => setEditOpen(false)} />
        )}
      </NodeViewWrapper>
    );
  }

  // YouTube preview
  if (name === 'youtube') {
    return (
      <NodeViewWrapper>
        <div className="relative my-2 rounded-md border border-(--border-primary) overflow-hidden">
          {attrs.videoId ? (
            <div className="relative aspect-video bg-black">
              <Image
                src={`https://img.youtube.com/vi/${attrs.videoId}/hqdefault.jpg`}
                alt="YouTube thumbnail"
                fill
                className="object-cover opacity-80"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-sm text-(--text-muted)">
              No video ID set
            </div>
          )}
          <div className="absolute right-1 top-1 flex gap-0.5">
            <button type="button" onClick={() => setEditOpen(true)} className="rounded bg-black/50 p-1 text-white hover:bg-black/70">
              <Pencil className="h-3 w-3" />
            </button>
            <button type="button" onClick={deleteNode} className="rounded bg-black/50 p-1 text-white hover:bg-black/70">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
        {editOpen && def && (
          <ShortcodeEditDialog def={def} attrs={attrs} content={content} onSave={handleSave} onClose={() => setEditOpen(false)} />
        )}
      </NodeViewWrapper>
    );
  }

  // Generic fallback
  const Icon = SHORTCODE_ICONS[name] ?? Info;
  return (
    <NodeViewWrapper>
      <div className="relative my-2 rounded-md border border-dashed border-(--border-primary) bg-(--surface-secondary) p-3">
        <div className="flex items-center gap-2 text-sm text-(--text-secondary)">
          <Icon className="h-4 w-4" />
          <span className="font-medium">[{name}]</span>
          <span className="text-xs text-(--text-muted)">{JSON.stringify(attrs)}</span>
        </div>
        <div className="absolute right-1 top-1 flex gap-0.5">
          <button type="button" onClick={() => setEditOpen(true)} className="rounded p-1 hover:bg-(--surface-secondary)">
            <Pencil className="h-3 w-3" />
          </button>
          <button type="button" onClick={deleteNode} className="rounded p-1 hover:bg-(--surface-secondary)">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      {editOpen && def && (
        <ShortcodeEditDialog def={def} attrs={attrs} content={content} onSave={handleSave} onClose={() => setEditOpen(false)} />
      )}
    </NodeViewWrapper>
  );
}
