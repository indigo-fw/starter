'use client';

import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  Trash2,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  Merge,
  Split,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  editor: Editor;
  __: (s: string) => string;
}

function TableButton({
  onClick,
  title,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1 rounded p-1.5 transition-colors text-sm',
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
          : 'text-(--text-secondary) hover:bg-(--surface-secondary)',
        disabled && 'opacity-30 cursor-not-allowed',
      )}
    >
      {children}
    </button>
  );
}

export function TableMenu({ editor, __ }: Props) {
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="tableMenu"
      shouldShow={({ editor: e, from, to }: { editor: Editor; from: number; to: number }) => {
        // Only show table controls when cursor is in a table but no text is selected
        // (when text is selected, the formatting BubbleMenu takes priority)
        return e.isActive('table') && from === to;
      }}
      options={{
        placement: 'top',
        offset: 8,
      }}
      className="table-menu flex items-center gap-0.5 rounded-lg border border-(--border-primary) bg-(--surface-primary) p-1 shadow-lg"
    >
      <TableButton
        onClick={() => editor.chain().focus().addRowBefore().run()}
        title={__('Add row above')}
      >
        <ArrowUpToLine className="h-4 w-4" />
      </TableButton>
      <TableButton
        onClick={() => editor.chain().focus().addRowAfter().run()}
        title={__('Add row below')}
      >
        <ArrowDownToLine className="h-4 w-4" />
      </TableButton>

      <div className="mx-0.5 h-5 w-px bg-(--border-primary)" />

      <TableButton
        onClick={() => editor.chain().focus().addColumnBefore().run()}
        title={__('Add column left')}
      >
        <ArrowLeftToLine className="h-4 w-4" />
      </TableButton>
      <TableButton
        onClick={() => editor.chain().focus().addColumnAfter().run()}
        title={__('Add column right')}
      >
        <ArrowRightToLine className="h-4 w-4" />
      </TableButton>

      <div className="mx-0.5 h-5 w-px bg-(--border-primary)" />

      <TableButton
        onClick={() => editor.chain().focus().mergeCells().run()}
        title={__('Merge cells')}
        disabled={!editor.can().mergeCells()}
      >
        <Merge className="h-4 w-4" />
      </TableButton>
      <TableButton
        onClick={() => editor.chain().focus().splitCell().run()}
        title={__('Split cell')}
        disabled={!editor.can().splitCell()}
      >
        <Split className="h-4 w-4" />
      </TableButton>

      <div className="mx-0.5 h-5 w-px bg-(--border-primary)" />

      <TableButton
        onClick={() => editor.chain().focus().deleteRow().run()}
        title={__('Delete row')}
        danger
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="text-[11px]">{__('Row')}</span>
      </TableButton>
      <TableButton
        onClick={() => editor.chain().focus().deleteColumn().run()}
        title={__('Delete column')}
        danger
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="text-[11px]">{__('Col')}</span>
      </TableButton>
      <TableButton
        onClick={() => editor.chain().focus().deleteTable().run()}
        title={__('Delete table')}
        danger
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span className="text-[11px]">{__('Table')}</span>
      </TableButton>
    </BubbleMenu>
  );
}
