'use client';

import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

/**
 * Renders a content variable as a styled inline chip in the TipTap editor.
 * Shows the variable name (e.g. "COMPANY_NAME") as a non-editable badge.
 * Click × to delete.
 */
export function ContentVariableNodeView({ node, deleteNode }: NodeViewProps) {
  const varName = node.attrs.variableName as string;

  return (
    <NodeViewWrapper as="span" className="content-var-chip">
      <span
        className="content-var-badge"
        contentEditable={false}
      >
        <span>{varName}</span>
        <button
          type="button"
          onClick={deleteNode}
          className="content-var-remove"
          title="Remove variable"
        >
          ×
        </button>
      </span>
    </NodeViewWrapper>
  );
}
