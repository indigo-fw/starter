import { Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ContentVariableNodeView } from './ContentVariableNodeView';

/**
 * TipTap node extension for content variables ([[VAR]]).
 * Renders as styled inline chips in the editor.
 * Non-editable (atom) — click the × to delete, use toolbar to insert.
 *
 * HTML representation: <span data-content-variable="COMPANY_NAME"></span>
 * Storage representation: [[COMPANY_NAME]]
 *
 * The conversion between [[VAR]] ↔ <span> happens in prepareVarsForEditor()
 * and serializeVarsForStorage() (called by RichTextEditor on load/save).
 */
export const ContentVariableNode = Node.create({
  name: 'contentVariable',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      variableName: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-content-variable]',
        getAttrs(node) {
          return {
            variableName: (node as HTMLElement).getAttribute('data-content-variable') ?? '',
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return [
      'span',
      { 'data-content-variable': node.attrs.variableName },
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ContentVariableNodeView, { inline: true });
  },
});

// ─── HTML ↔ Storage Transforms ──────────────────────────────────────────────

const VAR_REGEX = /\[\[(\w+)\]\]/g;
const SPAN_REGEX = /<span[^>]*\bdata-content-variable="(\w+)"[^>]*><\/span>/g;

/**
 * Convert [[VAR]] in markdown/HTML to <span data-content-variable="VAR"> for TipTap.
 * Called before loading content into the editor.
 */
export function prepareVarsForEditor(html: string): string {
  if (!html.includes('[[')) return html;
  return html.replace(VAR_REGEX, (_match, name: string) =>
    `<span data-content-variable="${name}"></span>`
  );
}

/**
 * Convert <span data-content-variable="VAR"> back to [[VAR]] for storage.
 * Called when saving editor content to markdown.
 */
export function serializeVarsForStorage(html: string): string {
  if (!html.includes('data-content-variable')) return html;
  return html.replace(SPAN_REGEX, (_match, name: string) => `[[${name}]]`);
}
