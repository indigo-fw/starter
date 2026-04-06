import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ShortcodeNodeView } from './ShortcodeNodeView';

export const ShortcodeNode = Node.create({
  name: 'shortcode',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      shortcodeName: { default: '' },
      shortcodeAttrs: { default: '{}' },
      shortcodeContent: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-shortcode]',
        getAttrs(node) {
          const el = node as HTMLElement;
          return {
            shortcodeName: el.getAttribute('data-shortcode') ?? '',
            shortcodeAttrs: el.getAttribute('data-shortcode-attrs') ?? '{}',
            shortcodeContent: el.getAttribute('data-shortcode-content') ?? '',
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return [
      'div',
      {
        'data-shortcode': node.attrs.shortcodeName,
        'data-shortcode-attrs': node.attrs.shortcodeAttrs,
        'data-shortcode-content': node.attrs.shortcodeContent,
      },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ShortcodeNodeView);
  },
});
