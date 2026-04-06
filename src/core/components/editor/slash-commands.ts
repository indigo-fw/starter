'use client';

import { Extension } from '@tiptap/react';
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion';
import type { Editor } from '@tiptap/react';

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: string;
  group: string;
  command: (props: { editor: Editor; range: { from: number; to: number } }) => void;
}

function getDefaultItems(__: (s: string) => string, editorId?: string): SlashCommandItem[] {
  return [
    {
      title: __('Heading 1'),
      description: __('Large section heading'),
      icon: 'H1',
      group: __('Headings'),
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
      },
    },
    {
      title: __('Heading 2'),
      description: __('Medium section heading'),
      icon: 'H2',
      group: __('Headings'),
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
      },
    },
    {
      title: __('Heading 3'),
      description: __('Small section heading'),
      icon: 'H3',
      group: __('Headings'),
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
      },
    },
    {
      title: __('Bullet List'),
      description: __('Unordered list'),
      icon: 'list',
      group: __('Lists'),
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: __('Numbered List'),
      description: __('Ordered list'),
      icon: 'list-ordered',
      group: __('Lists'),
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: __('Blockquote'),
      description: __('Quote block'),
      icon: 'quote',
      group: __('Blocks'),
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run();
      },
    },
    {
      title: __('Code Block'),
      description: __('Fenced code block'),
      icon: 'code',
      group: __('Blocks'),
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
      },
    },
    {
      title: __('Horizontal Rule'),
      description: __('Divider line'),
      icon: 'minus',
      group: __('Blocks'),
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run();
      },
    },
    {
      title: __('Table'),
      description: __('Insert a table'),
      icon: 'table',
      group: __('Blocks'),
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run();
      },
    },
    {
      title: __('Image'),
      description: __('Upload or embed an image'),
      icon: 'image',
      group: __('Media'),
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        // Trigger the hidden file input — scoped to this editor instance
        const eventName = editorId ? `editor:insert-image:${editorId}` : 'editor:insert-image';
        document.dispatchEvent(new CustomEvent(eventName));
      },
    },
  ];
}

export function createSlashCommandExtension(
  __: (s: string) => string,
  extraItems?: SlashCommandItem[],
  editorId?: string,
) {
  const items = [...getDefaultItems(__, editorId), ...(extraItems ?? [])];

  return Extension.create({
    name: 'slashCommand',
    addOptions() {
      return {
        suggestion: {
          char: '/',
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor;
            range: { from: number; to: number };
            props: SlashCommandItem;
          }) => {
            props.command({ editor, range });
          },
          items: ({ query }: { query: string }) => {
            return items.filter(
              (item) =>
                item.title.toLowerCase().includes(query.toLowerCase()) ||
                item.description.toLowerCase().includes(query.toLowerCase()),
            );
          },
        } satisfies Partial<SuggestionOptions<SlashCommandItem>>,
      };
    },
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashCommandItem>({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ];
    },
  });
}
