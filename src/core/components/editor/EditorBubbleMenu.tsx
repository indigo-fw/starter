'use client';

import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { EditorState } from '@tiptap/pm/state';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Link as LinkIcon,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  editor: Editor;
  __: (s: string) => string;
  onAddLink: () => void;
  onAiAssist?: () => void;
}

function BubbleButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'rounded p-1.5 transition-colors',
        active
          ? 'bg-brand-50 dark:bg-[oklch(0.65_0.17_var(--brand-hue)_/_0.15)] text-brand-700 dark:text-brand-400'
          : 'text-(--text-secondary) hover:bg-[oklch(1_0_0_/_0.1)] dark:hover:bg-[oklch(1_0_0_/_0.08)]',
      )}
    >
      {children}
    </button>
  );
}

export function EditorBubbleMenu({ editor, __, onAddLink, onAiAssist }: Props) {
  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: 'top',
        offset: 8,
      }}
      shouldShow={({ editor: e, state }: { editor: Editor; state: EditorState; from: number; to: number }) => {
        const { from, to } = state.selection;
        // Don't show if no text selected
        if (from === to) return false;
        // Don't show if inside a code block
        if (e.isActive('codeBlock')) return false;
        // Don't show if image is selected
        if (e.isActive('image')) return false;
        return true;
      }}
      className="bubble-menu flex items-center gap-0.5 rounded-lg border border-(--border-primary) bg-(--surface-primary) p-1 shadow-lg"
    >
      <BubbleButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        title={__('Bold')}
      >
        <Bold className="h-4 w-4" />
      </BubbleButton>
      <BubbleButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        title={__('Italic')}
      >
        <Italic className="h-4 w-4" />
      </BubbleButton>
      <BubbleButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive('underline')}
        title={__('Underline')}
      >
        <UnderlineIcon className="h-4 w-4" />
      </BubbleButton>
      <BubbleButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive('strike')}
        title={__('Strikethrough')}
      >
        <Strikethrough className="h-4 w-4" />
      </BubbleButton>
      <BubbleButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        title={__('Code')}
      >
        <Code className="h-4 w-4" />
      </BubbleButton>

      <div className="mx-0.5 h-5 w-px bg-(--border-primary)" />

      <BubbleButton
        onClick={onAddLink}
        active={editor.isActive('link')}
        title={__('Link')}
      >
        <LinkIcon className="h-4 w-4" />
      </BubbleButton>

      {onAiAssist && (
        <>
          <div className="mx-0.5 h-5 w-px bg-(--border-primary)" />
          <BubbleButton
            onClick={onAiAssist}
            title={__('AI Assist')}
          >
            <Sparkles className="h-4 w-4" />
          </BubbleButton>
        </>
      )}
    </BubbleMenu>
  );
}
