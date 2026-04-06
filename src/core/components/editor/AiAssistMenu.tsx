'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { computePosition, flip, shift, offset } from '@floating-ui/dom';
import {
  Sparkles,
  RefreshCw,
  Scissors,
  Expand,
  Languages,
  Loader2,
  Check,
  X,
  Pen,
} from 'lucide-react';

export interface AiAssistAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  instruction: string;
}

const iconClass = 'h-4 w-4';

function getDefaultActions(__: (s: string) => string): AiAssistAction[] {
  return [
    {
      id: 'rewrite',
      label: __('Rewrite'),
      icon: <RefreshCw className={iconClass} />,
      instruction: 'Rewrite this text to be clearer and more engaging. Keep the same meaning and approximate length.',
    },
    {
      id: 'shorten',
      label: __('Shorten'),
      icon: <Scissors className={iconClass} />,
      instruction: 'Make this text more concise. Remove unnecessary words while preserving the key message.',
    },
    {
      id: 'expand',
      label: __('Expand'),
      icon: <Expand className={iconClass} />,
      instruction: 'Expand this text with more detail and depth while keeping the same style and tone.',
    },
    {
      id: 'fix-grammar',
      label: __('Fix grammar'),
      icon: <Pen className={iconClass} />,
      instruction: 'Fix any grammar, spelling, or punctuation errors. Do not change the style or meaning.',
    },
    {
      id: 'translate',
      label: __('Translate to English'),
      icon: <Languages className={iconClass} />,
      instruction: 'Translate this text to English. Preserve formatting.',
    },
  ];
}

interface AiAssistMenuProps {
  editor: Editor;
  __: (s: string) => string;
  open: boolean;
  onClose: () => void;
  /** Called with selected text + instruction. Should return the AI result. */
  onSubmit: (text: string, instruction: string) => Promise<string>;
}

export function AiAssistMenu({ editor, __, open, onClose, onSubmit }: AiAssistMenuProps) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const actions = getDefaultActions(__);

  // Get selected text
  const getSelectedText = useCallback(() => {
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, ' ');
  }, [editor]);

  const runAction = useCallback(async (instruction: string) => {
    const text = getSelectedText();
    if (!text) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await onSubmit(text, instruction);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : __('AI request failed'));
    } finally {
      setLoading(false);
    }
  }, [getSelectedText, onSubmit, __]);

  const applyResult = useCallback(() => {
    if (!result) return;
    const { from, to } = editor.state.selection;
    editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, result).run();
    onClose();
    setResult(null);
  }, [result, editor, onClose]);

  const discardResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  // Position with floating-ui whenever open or content changes
  useEffect(() => {
    if (!open || !menuRef.current) return;

    const selectionFrom = editor.state.selection.from;
    const coords = editor.view.coordsAtPos(selectionFrom);

    const virtualEl = {
      getBoundingClientRect: () => ({
        x: coords.left,
        y: coords.top,
        width: 0,
        height: coords.bottom - coords.top,
        top: coords.top,
        right: coords.left,
        bottom: coords.bottom,
        left: coords.left,
      }),
    };

    computePosition(virtualEl, menuRef.current, {
      placement: 'top-start',
      middleware: [
        offset(8),
        flip({ padding: 8 }),
        shift({ padding: 8 }),
      ],
    }).then(({ x, y }) => {
      if (!menuRef.current) return;
      Object.assign(menuRef.current.style, {
        left: `${x}px`,
        top: `${y}px`,
      });
    });
  }, [open, editor, result, error, loading, showCustom]);

  // Focus custom input when shown
  useEffect(() => {
    if (showCustom && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showCustom]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setResult(null);
      setError(null);
      setLoading(false);
      setShowCustom(false);
      setCustomPrompt('');
    }
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={menuRef}
      className="ai-assist-menu fixed z-50 w-72 rounded-lg border border-(--border-primary) bg-(--surface-primary) shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-(--border-primary) px-3 py-2">
        <Sparkles className="h-4 w-4 text-accent-500" />
        <span className="text-sm font-medium text-(--text-primary)">{__('AI Assist')}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded p-0.5 text-(--text-muted) hover:text-(--text-secondary)"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-2 px-3 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-accent-500" />
          <span className="text-sm text-(--text-secondary)">{__('Thinking...')}</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="px-3 py-3">
          <p className="text-sm text-red-500">{error}</p>
          <button
            type="button"
            onClick={discardResult}
            className="mt-2 text-xs text-(--text-muted) hover:text-(--text-secondary)"
          >
            {__('Try again')}
          </button>
        </div>
      )}

      {/* Result preview */}
      {result && (
        <div className="px-3 py-3">
          <div className="max-h-40 overflow-y-auto rounded-md bg-(--surface-inset) p-2 text-sm text-(--text-primary)">
            {result}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={applyResult}
              className="btn btn-primary btn-sm flex items-center gap-1"
            >
              <Check className="h-3.5 w-3.5" />
              {__('Apply')}
            </button>
            <button
              type="button"
              onClick={discardResult}
              className="btn btn-secondary btn-sm"
            >
              {__('Discard')}
            </button>
          </div>
        </div>
      )}

      {/* Action list (hidden when loading/result) */}
      {!loading && !result && !error && (
        <div className="py-1">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => runAction(action.instruction)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors"
            >
              {action.icon}
              {action.label}
            </button>
          ))}

          <div className="mx-3 my-1 h-px bg-(--border-primary)" />

          {showCustom ? (
            <div className="px-3 py-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (customPrompt.trim()) runAction(customPrompt.trim());
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={__('Custom instruction...')}
                  className="input w-full text-sm"
                />
              </form>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustom(true)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-(--text-muted) hover:bg-(--surface-secondary) transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              {__('Custom instruction...')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
