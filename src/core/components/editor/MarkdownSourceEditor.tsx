'use client';

import { useMemo } from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { LanguageDescription } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';

import { useThemeStore } from '@/core/store/theme-store';

interface MarkdownSourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Forwarded so the parent can dispatch transactions (insert, replace, focus). */
  editorRef?: React.RefObject<ReactCodeMirrorRef | null>;
}

/**
 * CodeMirror 6 source editor for markdown + embedded HTML + Tailwind class
 * authoring. Used as the "Source" tab in the CMS RichTextEditor in place of
 * a plain textarea.
 *
 * Features:
 * - Markdown syntax highlighting with embedded HTML (via lang-markdown +
 *   lang-html as a code-language fallback)
 * - Reactive light/dark theme driven by `useThemeStore().resolvedTheme`
 * - Line numbers, code folding, bracket matching, find/replace, multi-cursor
 * - Soft line wrapping so long Tailwind class strings stay visible
 */
export function MarkdownSourceEditor({
  value,
  onChange,
  placeholder,
  className,
  editorRef,
}: MarkdownSourceEditorProps) {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);

  // Stable extensions array — recreating it would re-mount the EditorView
  // and lose cursor / scroll / undo state on every render.
  const extensions = useMemo(
    () => [
      markdown({
        base: markdownLanguage,
        // Highlight ```html / ```css / ```js fenced code blocks.
        // Inline HTML in markdown body is auto-highlighted by lang-markdown.
        codeLanguages: [
          LanguageDescription.of({
            name: 'html',
            alias: ['htm'],
            load: () => Promise.resolve(html()),
          }),
        ],
      }),
      EditorView.lineWrapping,
    ],
    [],
  );

  return (
    <CodeMirror
      ref={editorRef}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      theme={resolvedTheme === 'dark' ? oneDark : 'light'}
      extensions={extensions}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        bracketMatching: true,
        autocompletion: true,
        searchKeymap: true,
        tabSize: 2,
      }}
      className={className}
      height="100%"
    />
  );
}
