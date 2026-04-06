'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Replace,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  editor: Editor;
  __: (s: string) => string;
  onReplace: () => void;
}

function ImgButton({
  onClick,
  active,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'rounded p-1.5 transition-colors',
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
          : active
            ? 'bg-brand-50 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.15)] text-brand-700 dark:text-brand-400'
            : 'text-(--text-secondary) hover:bg-[oklch(1_0_0_/_0.1)] dark:hover:bg-[oklch(1_0_0_/_0.08)]',
      )}
    >
      {children}
    </button>
  );
}

export function ImageBubbleMenu({ editor, __, onReplace }: Props) {
  const [altText, setAltText] = useState('');

  // Sync alt text when selection changes
  const syncAlt = useCallback(() => {
    if (editor.isActive('image')) {
      const attrs = editor.getAttributes('image');
      setAltText((attrs.alt as string) ?? '');
    }
  }, [editor]);

  useEffect(() => {
    editor.on('selectionUpdate', syncAlt);
    return () => { editor.off('selectionUpdate', syncAlt); };
  }, [editor, syncAlt]);

  const commitAlt = useCallback(() => {
    if (!editor.isActive('image')) return;
    editor.chain().focus().updateAttributes('image', { alt: altText }).run();
  }, [editor, altText]);

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageBubbleMenu"
      shouldShow={({ editor: e }: { editor: Editor }) => e.isActive('image')}
      options={{
        placement: 'top',
        offset: 8,
      }}
      className="bubble-menu flex items-center gap-1 rounded-lg border border-(--border-primary) bg-(--surface-primary) p-1.5 shadow-lg"
    >
      {/* Alt text input */}
      <input
        type="text"
        value={altText}
        onChange={(e) => setAltText(e.target.value)}
        onBlur={commitAlt}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitAlt();
          }
          // Don't propagate to editor
          e.stopPropagation();
        }}
        placeholder={__('Alt text')}
        className="w-40 rounded border border-(--border-primary) bg-(--surface-secondary) px-2 py-1 text-xs text-(--text-primary) placeholder:text-(--text-muted) outline-none focus:border-accent-500"
      />

      <div className="mx-0.5 h-5 w-px bg-(--border-primary)" />

      {/* Alignment */}
      <ImgButton
        onClick={() => editor.chain().focus().updateAttributes('image', { style: '' }).run()}
        active={!editor.getAttributes('image').style}
        title={__('Align left')}
      >
        <AlignLeft className="h-4 w-4" />
      </ImgButton>
      <ImgButton
        onClick={() =>
          editor.chain().focus().updateAttributes('image', {
            style: 'display: block; margin-left: auto; margin-right: auto;',
          }).run()
        }
        active={((editor.getAttributes('image').style as string) ?? '').includes('auto')}
        title={__('Center')}
      >
        <AlignCenter className="h-4 w-4" />
      </ImgButton>
      <ImgButton
        onClick={() =>
          editor.chain().focus().updateAttributes('image', {
            style: 'display: block; margin-left: auto;',
          }).run()
        }
        active={((editor.getAttributes('image').style as string) ?? '').includes('margin-left: auto') &&
          !((editor.getAttributes('image').style as string) ?? '').includes('margin-right')}
        title={__('Align right')}
      >
        <AlignRight className="h-4 w-4" />
      </ImgButton>

      <div className="mx-0.5 h-5 w-px bg-(--border-primary)" />

      {/* Replace */}
      <ImgButton onClick={onReplace} title={__('Replace image')}>
        <Replace className="h-4 w-4" />
      </ImgButton>

      {/* Remove */}
      <ImgButton
        onClick={() => editor.chain().focus().deleteSelection().run()}
        title={__('Remove image')}
        danger
      >
        <Trash2 className="h-4 w-4" />
      </ImgButton>
    </BubbleMenu>
  );
}
